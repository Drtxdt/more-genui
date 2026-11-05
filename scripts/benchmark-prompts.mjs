import { writeFile } from 'node:fs/promises';
import { GUIDE } from '../src/protocol.mjs';
const tasks = [
  ['wave', '正弦波振幅和频率'],
  ['spring', '理想弹簧振子的刚度和时间，质量1kg'],
  ['sort', '冒泡排序的逐步演示'],
  ['quadratic', '二次函数的a、b、c与抛物线'],
  ['linear', '一次函数斜率和截距'],
  ['projectile', '无空气阻力的抛体运动初速度与角度，g=9.8'],
  ['ohm', '欧姆定律电压电阻与电流'],
  ['rgb', 'RGB三原色混合'],
  ['rectangle', '矩形长宽与面积周长'],
  ['coin', '独立公平硬币投掷次数与恰好k次正面的概率'],
];
await writeFile('tests/live/tasks.json', JSON.stringify(tasks, null, 2));
for (let round = 1; round <= 2; round++)
  for (let batch = 0; batch < 2; batch++)
    await writeFile(
      `tests/live/prompt-${round}-${batch}.txt`,
      `这是独立交互应用验收任务，第${round}轮。请分别完成以下5个题目，各自输出一个独立完整的genui-html代码块，共5块。每个应用尽量紧凑（约60行以内），有简短原理说明、可操作控件和实时可见结果，不要把5个应用合在一个页面。不要为了凑数省略实现。元数据id使用括号内的英文id。\n` +
        tasks
          .slice(batch * 5, batch * 5 + 5)
          .map(([id, label]) => `${label}（${id}-${round}）`)
          .join('\n') +
        '\n\n' +
        GUIDE,
    );
