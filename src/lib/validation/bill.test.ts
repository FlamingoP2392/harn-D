import {describe,it,expect} from 'vitest';
import {billSchema,moneySchema,weightSchema,percentSchema,parseDecimal} from './bill';
import {newBill,sampleBill,editableStorageSchema} from '../draft';
import {crc16,promptpayPayload} from '../qr';
describe('validation and persistence',()=>{
 it.each(['-1','NaN','Infinity','1e3','1.001','1.2.3','','.1','1,000','1000000000'])('rejects invalid money %s',s=>expect(moneySchema.safeParse(s).success).toBe(false));
 it('parses exact decimals and precision boundaries',()=>{expect(parseDecimal('999999999.99',2)).toBe(99999999999n);expect(weightSchema.safeParse('0.000001').success).toBe(true);expect(weightSchema.safeParse('0').success).toBe(false);expect(weightSchema.safeParse('1.0000001').success).toBe(false);expect(percentSchema.safeParse('100.01').success).toBe(false);expect(()=>parseDecimal('1.2.3',2)).toThrow();});
 it('allows incomplete persisted drafts but blocks calculation',()=>{const draft=newBill();draft.items=[{id:crypto.randomUUID(),name:'',amount:'',mode:'fixed',participants:[]}];expect(editableStorageSchema.safeParse({version:1,bills:[draft],activeId:draft.id}).success).toBe(true);expect(billSchema.safeParse(draft).success).toBe(false);expect(editableStorageSchema.safeParse({version:2,bills:[],activeId:null}).success).toBe(false);});
 it('malformed fixed amounts return validation errors without crashing',()=>{const b=sampleBill();b.items[0]!.mode='fixed';b.items[0]!.amount='invalid';b.items[0]!.participants[0]!.fixed='1.2.3';expect(()=>billSchema.safeParse(b)).not.toThrow();expect(billSchema.safeParse(b).success).toBe(false);});
 it('accepts templates',()=>{for(const template of ['dinner','bbq','trip'] as const)expect(billSchema.safeParse(sampleBill(template)).success).toBe(true);});
});
describe('PromptPay payload',()=>{
 it('uses standard CRC16 CCITT-FALSE reference vector',()=>expect(crc16('123456789')).toBe('29B1'));
 it.each([1n,12345n,99999999999n])('encodes exact amount %s and valid CRC',amount=>{const data=promptpayPayload('0812345678',amount);expect(data).toContain('010212');expect(data).toContain('0066812345678');expect(data.slice(-4)).toBe(crc16(data.slice(0,-4)));const tags=new Map<string,string>();let i=0;while(i<data.length){const tag=data.slice(i,i+2);const length=Number(data.slice(i+2,i+4));tags.set(tag,data.slice(i+4,i+4+length));i+=4+length;}expect(tags.get('54')).toBe((amount/100n).toString()+'.'+(amount%100n).toString().padStart(2,'0'));});
 it('rejects empty recipients and invalid amounts',()=>{expect(()=>promptpayPayload('',1n)).toThrow();expect(()=>promptpayPayload('0812345678',0n)).toThrow();});
});
