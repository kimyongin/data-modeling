/* Pair comparison rows without dropping duplicates or hiding missing rows. */
function pairReviewRows(expected, actual, keys = [], unordered = false) {
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),remaining=actual.map((row,index)=>({row,index})),pairs=[];
 for(let i=0;i<expected.length;i++){
  const row=expected[i];let at;
  if(keys.length){at=remaining.findIndex(x=>keys.every(k=>same(x.row[k],row[k]))&&same(x.row,row));if(at<0)at=remaining.findIndex(x=>keys.every(k=>same(x.row[k],row[k])));}
  else if(unordered)at=remaining.findIndex(x=>same(x.row,row));
  else at=remaining.findIndex(x=>x.index===i);
  const found=at>=0?remaining.splice(at,1)[0]:null;pairs.push({expected:row,actual:found?.row,index:i});
 }
 for(const item of remaining)pairs.push({actual:item.row,index:item.index});
 const valuesMatch=pairs.every(x=>x.expected&&x.actual&&same(x.expected,x.actual));
 return {pairs,orderMismatch:!unordered&&valuesMatch&&!same(expected,actual)};
}
if(typeof module!=='undefined')module.exports={pairReviewRows};
