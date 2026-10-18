import { SaxesParser } from 'saxes';
import { readXml } from './handler.ts';

export class FlexError extends Error {
  code:string; retryable:boolean;
  constructor(code: string, retryable = false) { super(code); this.code=code;this.retryable=retryable; }
}
export function flexCode(code: string): FlexError {
  if (code === '1012') return new FlexError('TOKEN_EXPIRED');
  if (code === '1015') return new FlexError('TOKEN_INVALID');
  if (code === '1013') return new FlexError('IP_RESTRICTED');
  if (code === '1014') return new FlexError('QUERY_INVALID');
  if (code === '1018') return new FlexError('RATE_LIMITED', true);
  if (code === '1019') return new FlexError('GENERATING', true);
  if (['1001','1004','1005','1006','1007','1008','1009','1021'].includes(code)) return new FlexError('BROKER_TEMPORARY', true);
  return new FlexError('BROKER_REJECTED');
}
// Parse the small protocol envelope strictly; never expose ErrorMessage or response URL.
export function flexEnvelope(xml: string): string {
  if (xml.length > 16384) throw new FlexError('INVALID_RESPONSE');
  const parser = new SaxesParser({ xmlns:false });
  const stack: string[] = []; const values: Record<string,string> = {}; let root = '';
  const invalid = () => { throw new FlexError('INVALID_RESPONSE'); };
  parser.on('error', invalid); parser.on('doctype', invalid); parser.on('processinginstruction', invalid);
  parser.on('opentag', tag => {
    if (stack.length > 1 || tag.name.includes(':')) invalid();
    if (!stack.length) root = tag.name;
    else { if (tag.name in values) invalid(); values[tag.name]=''; }
    stack.push(tag.name);
  });
  parser.on('text', text => { if (stack.length===2) values[stack[1]]+=text; else if(text.trim()) invalid(); });
  parser.on('cdata', invalid); parser.on('closetag',()=>{stack.pop();});
  parser.write(xml).close();
  if (root!=='FlexStatementResponse') invalid();
  if (values.Status==='Fail' && /^\d{4}$/.test(values.ErrorCode ?? '')) throw flexCode(values.ErrorCode);
  if (values.Status!=='Success' || !/^\d{1,40}$/.test(values.ReferenceCode ?? '')) invalid();
  return values.ReferenceCode;
}

export type FlexClaim = { lease:string; token:string; queryId:string; reference:string|null; from:string; to:string; account:string; attempts:number };
export async function fetchFlex(claim: FlexClaim, transport: typeof fetch = fetch): Promise<{ reference:string }|{ xml:string }> {
  const method = claim.reference ? 'GetStatement' : 'SendRequest';
  const url = new URL(`https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/${method}`);
  url.searchParams.set('t',claim.token); url.searchParams.set('q',claim.reference ?? claim.queryId); url.searchParams.set('v','3');
  if (!claim.reference) { url.searchParams.set('fd',claim.from.replaceAll('-','')); url.searchParams.set('td',claim.to.replaceAll('-','')); }
  try {
    const response = await transport(url, { redirect:'error', signal:AbortSignal.timeout(25000), headers:{'User-Agent':'Finly/1.0'} });
    if (response.status===429) throw new FlexError('RATE_LIMITED',true);
    if (response.status>=500) throw new FlexError('BROKER_TEMPORARY',true);
    if (!response.ok) throw new FlexError('BROKER_REJECTED');
    const xml = await readXml(new Request('https://internal.invalid', {method:'POST',body:response.body,duplex:'half'} as RequestInit));
    if (claim.reference && /^\s*(?:<\?xml[^?]*\?>\s*)?<FlexQueryResponse[\s>]/.test(xml)) return {xml};
    const reference = flexEnvelope(xml);
    if (claim.reference) throw new FlexError('INVALID_RESPONSE');
    return {reference};
  } catch(error) {
    if(error instanceof FlexError) throw error;
    if(error instanceof Error && ['LIMIT_EXCEEDED','INVALID_REPORT'].includes(error.message)) throw new FlexError(error.message);
    // Network exceptions may include the URL/token. Discard them entirely.
    throw new FlexError('NETWORK_TIMEOUT',true);
  }
}
