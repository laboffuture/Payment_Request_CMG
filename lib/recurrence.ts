/* Recurring meetings, tasks, tokens and training.

   A series is not a separate record. The first occurrence's id becomes the series id that
   every later one carries, so a series can be followed without another table to keep in
   step with this one.

   There is no scheduler on this host - the application runs under wrangler dev - so
   nothing fires on Monday morning by itself. Occurrences are worked out when somebody
   opens the register and any that are due are created then. A queue therefore appears
   when a person next looks, which is honest about what the machinery can do rather than
   pretending a clock is running somewhere.

   Every date is a plain YYYY-MM-DD day and all the arithmetic is UTC. Parsing
   "2026-09-22T00:00:00" gives local midnight while toISOString reports UTC, so in any zone
   ahead of UTC - Dubai at +4, India at +5:30, both of them ours - the two cancel out and a
   day's shift returns the day it was given. A daily series then repeats one date forever.
   The workforce store hit exactly that and fixed it the same way; this follows it. */

export const WEEKDAYS=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"] as const;
export type Weekday=typeof WEEKDAYS[number];

export const iso=(d:Date)=>d.toISOString().slice(0,10);
export const todayIso=()=>iso(new Date());
const parse=(date:string)=>new Date(`${date}T00:00:00Z`);
export const shiftDays=(date:string,days:number)=>{
  const d=parse(date);d.setUTCDate(d.getUTCDate()+days);return iso(d)};
export const addMonths=(date:string,months=1)=>{
  const d=parse(date);d.setUTCMonth(d.getUTCMonth()+months);return iso(d)};

/** The weekday a date falls on, as a name. */
export const weekdayOf=(date:string):Weekday=>WEEKDAYS[parse(date).getUTCDay()];

/** The first date on or after `from` that falls on `day`. Returns `from` if it already does. */
export function onOrAfter(from:string,day:Weekday):string{
  const want=WEEKDAYS.indexOf(day);
  if(want<0)return from;
  const have=parse(from).getUTCDay();
  return shiftDays(from,(want-have+7)%7)}

/* A series recurs only while its frequency says so. Anything else - "One time", an empty
   value, a word an administrator added to the list that means nothing here - does not, and
   is treated as not recurring rather than guessed at. */
export const recurs=(frequency?:string)=>
  ["Daily","Weekly","Monthly"].includes(String(frequency||"").trim());

/** The date after `due` for this frequency. Weekly honours the chosen day; without one it
    simply adds seven, which keeps whatever day the first occurrence was set on. */
export function nextDue(frequency:string,due:string,day?:string):string{
  const f=String(frequency||"").trim();
  if(f==="Daily")return shiftDays(due,1);
  if(f==="Monthly")return addMonths(due,1);
  if(f==="Weekly"){
    const wanted=WEEKDAYS.includes(day as Weekday)?day as Weekday:undefined;
    return wanted?onOrAfter(shiftDays(due,1),wanted):shiftDays(due,7)}
  return due}

export type Series={
  id:string;seriesId?:string;frequency?:string;recurDay?:string;recurUntil?:string;due?:string};

/* The occurrences a series is missing, given the latest one already recorded.

   Walks forward from that occurrence until it passes today, so a series nobody has opened
   for a month catches up rather than resuming as though the gap never happened. The cap
   stops a long-dormant one inserting hundreds of rows into a single page load; whatever is
   still missing is created on the next visit.

   It stops one occurrence PAST today, not at it, and that is the point rather than an
   accident of the comparison. A queue is meant to show what is coming: if generation
   halted at today, then on a Tuesday a Monday series would have nothing upcoming in it
   until Monday arrived, which is a log of what has happened rather than a queue of what is
   due. So there is always exactly one occurrence ahead - and creating a series due today
   generates nothing, because that occurrence is already the one ahead.

   An end date stops it. So does a frequency that does not recur, or a due date that has
   not arrived - there is nothing to catch up to yet. */
export function pendingDues(series:Series,now=todayIso(),cap=12):string[]{
  const out:string[]=[];
  if(!recurs(series.frequency))return out;
  const start=String(series.due||"").trim();
  if(!start)return out;
  const until=String(series.recurUntil||"").trim();
  let cursor=start;
  let guard=0;
  while(cursor<now&&guard<cap){
    const due=nextDue(String(series.frequency),cursor,series.recurDay);
    if(due<=cursor)break;                       // never loop on a date that does not advance
    if(until&&due>until)break;
    out.push(due);
    cursor=due;
    guard++}
  return out}

/** A short, readable description of the rule, for a screen to show. */
export function describe(frequency?:string,day?:string,until?:string):string{
  if(!recurs(frequency))return "Does not repeat";
  const f=String(frequency).trim();
  const base=f==="Weekly"&&WEEKDAYS.includes(day as Weekday)?`Every ${day}`
    :f==="Daily"?"Every day":f==="Weekly"?"Every week":"Every month";
  return until?`${base}, until ${until}`:base}
