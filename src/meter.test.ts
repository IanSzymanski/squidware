import { describe, expect, it } from 'vitest';
import { DEFAULT_METER, defaultMeterGrouping, meterText, parseMeterText } from './meter';

describe('meter text',()=>{
  it('infers bar accents, or groups of three for compound eighth-note meters',()=>{
    expect(defaultMeterGrouping(4,4)).toEqual([4]); expect(defaultMeterGrouping(3,8)).toEqual([3]);
    expect(defaultMeterGrouping(6,8)).toEqual([3,3]); expect(defaultMeterGrouping(12,8)).toEqual([3,3,3,3]);
    expect(defaultMeterGrouping(7,8)).toEqual([7]); expect(defaultMeterGrouping(6,4)).toEqual([6]);
    expect(parseMeterText('9/8').grouping).toEqual(defaultMeterGrouping(9,8));
  });
  it('omits default groups and keeps explicit ones',()=>{
    expect(meterText(DEFAULT_METER)).toBe('4/4');
    for(const [text,shown] of [['4/4','4/4'],['4/4:4','4/4'],['3/4','3/4'],['6/8','6/8'],['6/8:3+3','6/8'],['12/8','12/8'],['7/8:2+2+3','7/8:2+2+3'],['6/8:2+2+2','6/8:2+2+2'],['4/4:2+2','4/4:2+2'],[' 5/4 : 3 + 2 ','5/4:3+2']])
      expect(meterText(parseMeterText(text))).toBe(shown);
  });
  it('round trips exactly, so distinct meters never share text',()=>{
    const meters=['1/4','3/4','4/4','4/4:2+2','4/4:1+3','6/8','6/8:2+2+2','7/8:2+2+3','9/8','12/8','12/8:3+3+2+2+2','5/16:2+3','2/2'].map(parseMeterText);
    for(const meter of meters) expect(parseMeterText(meterText(meter))).toEqual(meter);
    expect(new Set(meters.map(meterText)).size).toBe(meters.length);
  });
});
