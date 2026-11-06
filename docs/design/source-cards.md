# 0.6 来源卡设计稿

用同一份[脱敏检索样本](../../tests/fixtures/search-share.json)排三种版式。它包含三个 Kaggle 链接、引用编号和站点图标，缺少可核实的文章标题。以下路径直接取自样本，线框中的分节和引用位置用于演示。

### 没有封面，仍能核对原文

读者走到第一处引用时，段落下面有一行可点击的文字。

```text
[1] kaggle.com · discussions/general/698932 ↗
```

有官方标题时优先展示标题；样本缺标题时使用域名和可辨别的路径。点击直接打开登记的来源页。站点图标不充当文章封面。

### 一节引用两篇资料

如果第一节同时引用 1 和 2，同一处列出两个链接。来源共用的域名不能用于去重。

```text
本节来源
[1] kaggle.com · discussions/general/698932 ↗
[2] kaggle.com · discussions/getting-started/588196 ↗
```

官方编号仍能点开，来源卡作为附加入口。窄屏逐行排列。图片最多点缀其中一项，不能挤掉另一项链接。

### 第三个来源没有明确落点

回答结束后，文末提供一个可展开的集合。读者即使只记得编号，也能从这里找回原文。

```text
▾ 全部检索来源（3）
  [1] discussions/general/698932
  [2] discussions/getting-started/588196
  [3] competitions/data-detective-beginner-ai-challenge/overview/abstract
```

第 3 项只在集合中出现，不推测它支持哪个段落。验收时关掉配图并阻断外站，仍应能从原始检索记录列出三个入口。可比较原生界面和设计稿中“找到第 2 个链接、打开第 3 项原文”的操作数，再决定是否开发。
