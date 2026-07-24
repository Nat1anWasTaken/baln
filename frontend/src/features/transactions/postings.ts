export type Posting={account_key:string;amount_minor:number;memo?:string|null}
export function expensePostings(source:string,category:string,amount:number):Posting[]{return [{account_key:category,amount_minor:amount},{account_key:source,amount_minor:-amount}]}
export function incomePostings(destination:string,category:string,amount:number):Posting[]{return [{account_key:destination,amount_minor:amount},{account_key:category,amount_minor:-amount}]}
export function transferPostings(source:string,destination:string,amount:number):Posting[]{return [{account_key:destination,amount_minor:amount},{account_key:source,amount_minor:-amount}]}
export function validatePostings(postings:Posting[]){if(postings.length<2)return '至少需要兩筆分錄';if(postings.some(p=>!Number.isInteger(p.amount_minor)||p.amount_minor===0||!p.account_key))return '每筆分錄需有帳戶與非零整數金額';if(postings.reduce((sum,p)=>sum+p.amount_minor,0)!==0)return '借貸金額合計必須為零';return null}
export function entryAmount(postings:Posting[]){return Math.max(0,...postings.map(p=>Math.abs(p.amount_minor)))}
