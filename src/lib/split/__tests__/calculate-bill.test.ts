import {describe,it,expect} from 'vitest';
import fc from 'fast-check';
import {calculateBill,roundRatio,settleBalances,type SplitBill} from '../calculate-bill';
const people=['a','b','c'].map(id=>({id,name:id}));
function bill(amount=10000n):SplitBill{return {people,items:[{id:'food',name:'อาหาร',amountSatang:amount,mode:'equal',participants:people.map(p=>({personId:p.id,weight:1n,fixedSatang:0n}))}],serviceBps:0n,vatBps:0n,vatIncluded:false,discountSatang:0n,paidBy:'a'};}
describe('complete bill calculation',()=>{
 it.each([0n,1n,10000n,1000000000n,99999999999n])('conserves %s satang',amount=>{const r=calculateBill(bill(amount));expect(r.people.reduce((s,p)=>s+p.total,0n)).toBe(amount);});
 it('splits 100 baht deterministically by original person order',()=>{const b=bill();const result=calculateBill({...b,items:b.items.map(i=>({...i,participants:[...i.participants].reverse()}))});expect(result.people.map(p=>p.total)).toEqual([3334n,3333n,3333n]);});
 it('allocates fractional weights without floats',()=>{const b=bill();const r=calculateBill({...b,items:b.items.map(i=>({...i,mode:'weight',participants:i.participants.map((p,index)=>({...p,weight:[500000n,1500000n,3000000n][index]??1n}))}))});expect(r.people.map(p=>p.total)).toEqual([1000n,3000n,6000n]);});
 it('handles explicit amounts and rejects mismatches',()=>{const b=bill();const fixed={...b,items:b.items.map(i=>({...i,mode:'fixed' as const,participants:i.participants.map((p,index)=>({...p,fixedSatang:[2000n,3000n,5000n][index]??0n}))}))};expect(calculateBill(fixed).people.map(p=>p.total)).toEqual([2000n,3000n,5000n]);expect(()=>calculateBill({...fixed,items:fixed.items.map(i=>({...i,amountSatang:10001n}))})).toThrow('ส่วนต่าง 1');});
 it('adds excluded VAT on base plus service',()=>{const r=calculateBill({...bill(),serviceBps:1000n,vatBps:700n});expect([r.service,r.vat,r.total]).toEqual([1000n,770n,11770n]);});
 it('adds only service VAT for included prices',()=>{const r=calculateBill({...bill(),serviceBps:1000n,vatBps:700n,vatIncluded:true});expect([r.service,r.vat,r.total,r.includedVat]).toEqual([1000n,70n,11070n,654n]);});
 it('allocates service and VAT by item price',()=>{const b=bill();const i=b.items[0]!;const r=calculateBill({...b,items:[{...i,amountSatang:10000n,participants:[i.participants[0]!]},{...i,id:'drink',amountSatang:30000n,participants:[i.participants[1]!]}],serviceBps:1000n,vatBps:700n,discountSatang:4000n});expect(r.people.map(p=>[p.service,p.vat,p.discount,p.total])).toEqual([[1000n,770n,1000n,10770n],[3000n,2310n,3000n,32310n],[0n,0n,0n,0n]]);});
 it('handles a full discount, zero bases, and a single satang discount',()=>{expect(calculateBill({...bill(),discountSatang:10000n}).total).toBe(0n);expect(calculateBill({...bill(0n),serviceBps:1000n,vatBps:700n}).total).toBe(0n);expect(calculateBill({...bill(3n),discountSatang:1n}).people.map(p=>p.total)).toEqual([0n,1n,1n]);});
 it('rejects empty, negative and foreign inputs',()=>{const b=bill();expect(()=>calculateBill({...b,people:[]})).toThrow();expect(()=>calculateBill({...b,items:[]})).toThrow();expect(()=>calculateBill({...b,items:b.items.map(i=>({...i,participants:[]}))})).toThrow('เลือกคนหาร');expect(()=>calculateBill(bill(-1n))).toThrow();expect(()=>calculateBill({...b,paidBy:'unknown'})).toThrow();expect(()=>calculateBill({...b,discountSatang:10001n})).toThrow();expect(()=>calculateBill({...b,vatBps:10001n})).toThrow();});
 it('rounds half up',()=>{expect(roundRatio(5n,2n)).toBe(3n);expect(roundRatio(4n,3n)).toBe(1n);});
 it('settles balances without mutating inputs',()=>{const balances=[{personId:'a',balance:-70n},{personId:'b',balance:100n},{personId:'c',balance:-30n}];expect(settleBalances(balances)).toEqual([{from:'a',to:'b',amount:70n},{from:'c',to:'b',amount:30n}]);expect(balances[0]?.balance).toBe(-70n);expect(()=>settleBalances([{personId:'a',balance:1n}])).toThrow();});
 it('conserves all totals and is deterministic across 1–30 people and 1–100 items',()=>{
   fc.assert(fc.property(fc.integer({min:1,max:30}),fc.array(fc.record({amount:fc.bigInt({min:0n,max:99999999999n}),seed:fc.integer({min:1,max:1000000}),weighted:fc.boolean()}),{minLength:1,maxLength:100}),fc.integer({min:0,max:10000}),fc.integer({min:0,max:10000}),fc.boolean(),fc.integer({min:0,max:10000}),(count,items,service,vat,included,discountRatio)=>{
    const ps=Array.from({length:count},(_,i)=>({id:String(i),name:String(i)}));
    const b:SplitBill={people:ps,items:items.map((item,i)=>({id:String(i),name:'item',amountSatang:item.amount,mode:item.weighted?'weight':'equal',participants:ps.filter((_,j)=>j===0||(j+item.seed)%3!==0).map((p,j)=>({personId:p.id,weight:BigInt((item.seed*(j+1))%1000000+1),fixedSatang:0n}))})),serviceBps:BigInt(service),vatBps:BigInt(vat),vatIncluded:included,discountSatang:0n,paidBy:'0'};
    const gross=calculateBill(b);const discounted={...b,discountSatang:gross.total*BigInt(discountRatio)/10000n};const r=calculateBill(discounted);
    expect(r).toEqual(calculateBill(discounted));expect(r.people.reduce((s,p)=>s+p.total,0n)).toBe(r.total);expect(r.people.every(p=>p.total>=0n)).toBe(true);
    expect(r.people.reduce((s,p)=>s+p.service,0n)).toBe(r.service);expect(r.people.reduce((s,p)=>s+p.vat,0n)).toBe(r.vat);expect(r.people.reduce((s,p)=>s+p.discount,0n)).toBe(r.discount);
   }),{numRuns:200,seed:20261018});
 });
});
