"""Synthetic fixtures, not real-report evidence."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("positions", Path(__file__).parents[1] / "scripts/check_ibkr_positions.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def report(to="20260731", quantity="13", trades="", from_date="20260701", extra=""):
    position = f'<OpenPosition accountId="TEST" conid="1" currency="USD" multiplier="1" assetCategory="STK" levelOfDetail="SUMMARY" side="Long" reportDate="{to}" position="{quantity}"/>' if quantity is not None else ""
    return (f'<FlexQueryResponse type="AF"><FlexStatements count="1"><FlexStatement accountId="TEST" fromDate="{from_date}" toDate="{to}"><OpenPositions>{position}</OpenPositions><Trades>{trades}</Trades><Transfers/><CorporateActions/>{extra}</FlexStatement></FlexStatements></FlexQueryResponse>').encode()


def trade(id="1", quantity="3", day="20260712"):
    side = "SELL" if quantity.startswith("-") else "BUY"
    return f'<Trade accountId="TEST" conid="1" currency="USD" multiplier="1" assetCategory="STK" levelOfDetail="EXECUTION" transactionType="ExchTrade" tradeID="{id}" tradeDate="{day}" buySell="{side}" quantity="{quantity}"/>'


class QuantityAuditTests(unittest.TestCase):
    def opening(self, quantity="10"):
        return report("20260630", quantity, from_date="20260601")

    def test_exact_fractional_buy_and_full_close(self):
        result = module.audit(self.opening("10.000000000000000001"), report(quantity="13.000000000000000002", trades=trade(quantity="3.000000000000000001")))
        self.assertTrue(result["quantitiesMatch"])
        self.assertEqual(result["stockExecutions"], 1)
        self.assertTrue(module.audit(self.opening(), report(quantity=None, trades=trade(quantity="-10")))["quantitiesMatch"])

    def test_mismatch_is_not_rounded_away(self):
        self.assertEqual(module.audit(self.opening(), report(quantity="13.000000000000000001", trades=trade()))["quantityMismatches"], 1)

    def test_date_coverage_and_snapshot_order(self):
        for earlier, later in [(self.opening(), report(from_date="20260702")), (report(), self.opening())]:
            with self.assertRaises(module.AuditError):
                module.audit(earlier, later)

    def test_missing_section_duplicates_and_corrections(self):
        for data in [report().replace(b"<OpenPositions>", b"<Missing>").replace(b"</OpenPositions>", b"</Missing>"),
                     report(trades=trade()+trade()), report(trades=trade().replace('transactionType="ExchTrade"', 'transactionType="Cancel"')),
                     report().replace(b'assetCategory="STK"', b'assetCategory="BOND"'),
                     report().replace(b'<Transfers/>', b'<Transfers><Transfer accountId="TEST" assetCategory="STK"/></Transfers>')]:
            with self.assertRaises(module.AuditError):
                module.audit(self.opening(), data)

    def test_no_changes_does_not_verify_trade_mapping_or_history(self):
        result = module.audit(report("20260722", "10"), report(quantity="10", trades=trade(day="20260712")))
        self.assertTrue(result["quantitiesMatch"])
        self.assertEqual(result["note"], "NO_STOCK_MOVEMENTS_IN_INTERVAL")
        self.assertFalse(result["fullHistoryVerified"])

    def test_xml_and_cross_account_checks(self):
        for data in [b'<!DOCTYPE x>'+report(), report().replace(b'TEST', b'OTHER'),
                     report().replace(b'reportDate="20260731"', b'reportDate="20260730"')]:
            with self.assertRaises(module.AuditError):
                module.audit(self.opening(), data)


if __name__ == "__main__":
    unittest.main()
