// Accept only omitted weekend edges, never a missing weekday or an omitted event.
// Actual cash dates remain attached to the balance; no dates/amounts are rewritten.
export function coversCashPeriod(from:string,to:string,cashFrom:string,cashTo:string,eventDates:string[]):boolean {
  if(cashFrom<from || cashTo>to || cashFrom>cashTo) return false;
  const day=86400000;
  const start=Date.parse(`${from}T00:00:00Z`), end=Date.parse(`${to}T00:00:00Z`);
  const left=Date.parse(`${cashFrom}T00:00:00Z`),right=Date.parse(`${cashTo}T00:00:00Z`);
  if(![start,end,left,right].every(Number.isFinite) || left-start>2*day || end-right>2*day) return false;
  const weekend=(ms:number)=>[0,6].includes(new Date(ms).getUTCDay());
  for(let d=start;d<left;d+=day) if(!weekend(d)) return false;
  for(let d=right+day;d<=end;d+=day) if(!weekend(d)) return false;
  return !eventDates.some(d=>!d || d<cashFrom || d>cashTo);
}
