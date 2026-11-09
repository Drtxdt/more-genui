import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { augment } from '../src/protocol.mjs';
import { composePolicy } from '../src/prompt-policy.mjs';
const seed = 20261109;
const cases = [
 ['roast','日常','四人份原先用羊排 1000 克、土豆 800 克。客人可能变成六人，我想按实际人数采购，买到一样勾掉一样，也能把清单发给家人。','6 人：羊排 1500 g、土豆 1200 g；能勾选并复制当前量。'],
 ['bill','日常','甲乙平分 14 元的披萨，17 元的意面只有乙吃。税额 2.48 元，按税前金额给 20% 小费，税和小费按各人餐费占比分，怎么结账？如果不付小费呢？','甲 8.96、乙 30.72，零小费总额 33.48。'],
 ['first','教学','A → B C，B → a | ε，C → c。先让我猜 FIRST(A)，再看看删掉 B 的空产生式会改变什么，为什么？','预测后揭晓 {a,c}；删除空产生式后 {a}；解释 C 不再可达。'],
 ['nfa','教学','q0 和 q1 之间各有一条 ε 边，q1 读 a 到 q2；q0 初始，只有 q2 接受。读一个 a 会经历哪些状态？如果撤掉 q0 到 q1 的边呢？','初始闭包 {q0,q1}，a 后 {q2} 接受；删除边后拒绝。'],
 ['terminal','短答','一句话解释文法里的终结符。','单句、语义正确、无卡。'],
 ['median','短答','一句话解释中位数。','单句说明排序后居中的值及偶数情形，无卡。'],
];
const sha = s=>createHash('sha256').update(s).digest('hex');
export function manifest(buildCommit){
 if(!/^[a-f0-9]{40}$/.test(buildCommit)) throw Error('需要候选提交的完整 SHA');
 let prng=seed;
 function shuffle(a){for(let i=a.length-1;i>0;i--){prng=(Math.imul(1664525,prng)+1013904223)>>>0;const j=prng%(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
 const rows=[];
 for(const [id,category,prompt,assertion] of shuffle([...cases])) for(const mode of shuffle(['普通','思考'])) for(const strategy of shuffle(['A','B','C','D'])){
 const actual=strategy==='A'?augment(prompt):composePolicy(prompt,strategy);
 rows.push({sequence:rows.length+1,id,category,mode,strategy,prompt,assertion,policyHash:sha(actual.slice(actual.indexOf('[More GenUI v1]'))),taskHash:sha(prompt)});
 }
 return {buildCommit,seed,rows};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/community-trial.mjs')) console.log(JSON.stringify(manifest(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()),null,2));
