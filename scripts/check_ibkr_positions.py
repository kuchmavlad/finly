"""Local quantity audit of two Flex snapshots. Never uploads or prints financial values.

Usage: python scripts/check_ibkr_positions.py opening.xml closing.xml
This is a diagnostic, not the production import adapter or a holdings publication gate.
"""
import argparse
from datetime import datetime, timedelta
from decimal import Decimal, localcontext
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET


class AuditError(Exception):
    pass


def require(condition, code):
    if not condition:
        raise AuditError(code)


def day(value):
    require(bool(re.fullmatch(r"[0-9]{8}", value)), "INVALID_DATE")
    try:
        return datetime.strptime(value, "%Y%m%d").date()
    except ValueError:
        raise AuditError("INVALID_DATE") from None


def number(value):
    require(bool(re.fullmatch(r"-?(0|[1-9][0-9]{0,17})(\.[0-9]{1,18})?", value)), "INVALID_DECIMAL")
    return Decimal(value)


def read_statement(data):
    require(len(data) <= 10 * 1024 * 1024, "SIZE_LIMIT")
    require(not re.search(rb"<!\s*(DOCTYPE|ENTITY)", data, re.I), "DTD_FORBIDDEN")
    parser = ET.XMLPullParser(events=("start", "end"))
    root = None
    depth = count = 0
    try:
        for offset in range(0, len(data), 16384):
            parser.feed(data[offset:offset + 16384])
            for event, node in parser.read_events():
                if event == "start":
                    if root is None:
                        root = node
                    depth += 1
                    count += 1
                    require(depth <= 8 and count <= 20000, "STRUCTURE_LIMIT")
                    require("{" not in node.tag and ":" not in node.tag, "NAMESPACE_UNSUPPORTED")
                    require(len(node.attrib) <= 160 and all(len(v) <= 4096 for v in node.attrib.values()), "FIELD_LIMIT")
                else:
                    require(not (node.text or "").strip() and not (node.tail or "").strip(), "UNEXPECTED_TEXT")
                    depth -= 1
        parser.close()
    except ET.ParseError:
        raise AuditError("INVALID_XML") from None
    require(root is not None and root.tag == "FlexQueryResponse" and root.get("type") == "AF", "INVALID_ENVELOPE")
    require(len(root) == 1 and root[0].tag == "FlexStatements", "INVALID_ENVELOPE")
    require(root[0].get("count") == "1" and len(root[0]) == 1 and root[0][0].tag == "FlexStatement", "ONE_ACCOUNT_REQUIRED")
    statement = root[0][0]
    require(bool(statement.get("accountId")), "MISSING_ACCOUNT")
    require(day(statement.get("fromDate", "")) <= day(statement.get("toDate", "")), "INVALID_PERIOD")
    require(len({n.tag for n in statement}) == len(statement), "DUPLICATE_SECTION")
    return statement


def section(statement, name):
    node = statement.find(name)
    require(node is not None, "MISSING_" + name.upper())
    return node


def contract(row, owner):
    require(row.get("accountId") == owner, "ACCOUNT_MISMATCH")
    conid = row.get("conid", "")
    currency = row.get("currency", "")
    require(bool(conid) and bool(re.fullmatch(r"[A-Z]{3}", currency)), "INVALID_CONTRACT")
    require(number(row.get("multiplier", "")) == 1, "UNSUPPORTED_MULTIPLIER")
    return conid, currency


def snapshot(statement):
    positions = {}
    for row in section(statement, "OpenPositions"):
        require(row.tag == "OpenPosition" and len(row) == 0, "INVALID_POSITION")
        require(row.get("assetCategory") == "STK" and row.get("levelOfDetail") == "SUMMARY"
                and row.get("side") == "Long" and not row.get("code"), "UNSUPPORTED_POSITION")
        require(day(row.get("reportDate", "")) == day(statement.get("toDate", "")), "POSITION_DATE_MISMATCH")
        conid, currency = contract(row, statement.get("accountId"))
        require(conid not in positions, "DUPLICATE_POSITION")
        quantity = number(row.get("position", ""))
        require(quantity >= 0, "UNSUPPORTED_SHORT")
        positions[conid] = (currency, quantity)
    return positions


def audit(opening_data, closing_data):
    opening = read_statement(opening_data)
    closing = read_statement(closing_data)
    owner = opening.get("accountId")
    require(owner == closing.get("accountId"), "ACCOUNT_MISMATCH")
    start = day(opening.get("toDate", ""))
    end = day(closing.get("toDate", ""))
    require(start < end, "SNAPSHOT_ORDER")
    require(day(closing.get("fromDate", "")) <= start + timedelta(days=1), "EVENT_COVERAGE_GAP")
    before, after = snapshot(opening), snapshot(closing)
    # Any position-affecting event without an evidenced mapping blocks the diagnostic.
    require(len(section(closing, "CorporateActions")) == 0, "UNSUPPORTED_CORPORATE_ACTION")
    for transfer in section(closing, "Transfers"):
        require(transfer.tag == "Transfer" and transfer.get("accountId") == owner
                and transfer.get("assetCategory") == "CASH", "UNSUPPORTED_ASSET_TRANSFER")
    changes, currencies, ids = {}, {}, set()
    movements = 0
    with localcontext() as ctx:
        ctx.prec = 100
        for row in section(closing, "Trades"):
            require(row.tag == "Trade" and len(row) == 0 and row.get("accountId") == owner, "INVALID_TRADE")
            trade_date = day(row.get("tradeDate", ""))
            require(day(closing.get("fromDate", "")) <= trade_date <= end, "TRADE_OUTSIDE_REPORT")
            if not start < trade_date <= end:
                continue
            require(row.get("assetCategory") in ("STK", "CASH"), "UNSUPPORTED_ASSET")
            if row.get("assetCategory") == "CASH":
                continue  # Currency legs do not change security quantities.
            require(row.get("levelOfDetail") == "EXECUTION" and row.get("transactionType") == "ExchTrade"
                    and row.get("notes", "") in ("", "IA"), "UNSUPPORTED_EXECUTION")
            require(not any(row.get(k) for k in ("origTradeID", "origTradeDate"))
                    and row.get("origOrderID", "") in ("", "0"), "UNSUPPORTED_CORRECTION")
            for key in ("origTradePrice", "changeInPrice", "changeInQuantity"):
                require(not row.get(key) or number(row.get(key)) == 0, "UNSUPPORTED_CORRECTION")
            identity = row.get("tradeID")
            require(bool(identity) and identity not in ids, "AMBIGUOUS_TRADE_ID")
            ids.add(identity)
            conid, currency = contract(row, owner)
            require(conid not in currencies or currencies[conid] == currency, "CONTRACT_CURRENCY_CHANGED")
            currencies[conid] = currency
            quantity = number(row.get("quantity", ""))
            require(row.get("buySell") in ("BUY", "SELL") and quantity != 0
                    and (quantity > 0) == (row.get("buySell") == "BUY"), "INVALID_TRADE_SIGN")
            changes[conid] = changes.get(conid, Decimal(0)) + quantity
            movements += 1
        keys = set(before) | set(after) | set(changes)
        mismatches = 0
        for key in keys:
            currency_set = {p[key][0] for p in (before, after) if key in p}
            if key in currencies:
                currency_set.add(currencies[key])
            require(len(currency_set) == 1, "CONTRACT_CURRENCY_CHANGED")
            expected = before.get(key, (None, Decimal(0)))[1] + changes.get(key, Decimal(0))
            if expected != after.get(key, (None, Decimal(0)))[1]:
                mismatches += 1
    return {"openingDate": start.isoformat(), "closingDate": end.isoformat(),
            "instruments": len(keys), "stockExecutions": movements, "quantityMismatches": mismatches,
            "quantitiesMatch": mismatches == 0, "fullHistoryVerified": False,
            "note": "NO_STOCK_MOVEMENTS_IN_INTERVAL" if movements == 0 else "QUANTITY_AUDIT_ONLY"}


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("opening_report", type=Path)
    args.add_argument("closing_report", type=Path)
    paths = args.parse_args()
    try:
        values = []
        for path in (paths.opening_report, paths.closing_report):
            with path.open("rb") as source:
                values.append(source.read(10 * 1024 * 1024 + 1))
        result = audit(*values)
        print(json.dumps(result, indent=2))
        return 0 if result["quantitiesMatch"] else 1
    except (OSError, AuditError) as error:
        print(json.dumps({"error": str(error) if isinstance(error, AuditError) else "FILE_UNAVAILABLE"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
