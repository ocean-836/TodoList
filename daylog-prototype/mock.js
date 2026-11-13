/* 原型数据源：所有页面统一从这里读取，方便后续替换为真实接口 */

(function (global) {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // 以「今天」为基准生成相对日期，保证任何时间打开原型都有内容
  const day = (offset) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    return iso(d);
  };

  const DB = {
    categories: [
      { id: 'work', name: '工作', color: '#7FB2FF' },
      { id: 'life', name: '生活', color: '#6FD3B6' },
      { id: 'study', name: '学习', color: '#F5B843' },
      { id: 'health', name: '健康', color: '#FF8FA3' }
    ],

    tasks: [
      { id: 't01', title: '产品路线图评审', date: day(-8), time: '14:00', cat: 'work', done: true, note: '确认 Q4 优先级' },
      { id: 't02', title: '英语晨读', date: day(-7), time: '08:30', cat: 'study', done: true, note: '' },
      { id: 't03', title: '报销单提交', date: day(-6), time: null, cat: 'work', done: true, note: '差旅费用' },
      { id: 't04', title: '夜跑 5 公里', date: day(-5), time: '20:30', cat: 'health', done: true, note: '' },
      { id: 't05', title: '整理会议记录', date: day(-4), time: null, cat: 'work', done: true, note: '' },
      { id: 't06', title: '产品周会', date: day(-2), time: '10:00', cat: 'work', done: false, note: '同步本周进展' },
      { id: 't07', title: '预约牙医', date: day(-1), time: '15:00', cat: 'health', done: false, note: '记得带医保卡' },
      { id: 't08', title: '整理需求文档', date: day(0), time: null, cat: 'work', done: false, note: '把评审后的改动同步进文档' },
      { id: 't09', title: '晨跑 5 公里', date: day(0), time: '07:00', cat: 'health', done: true, note: '' },
      { id: 't10', title: '英语晨读', date: day(0), time: '08:30', cat: 'study', done: false, note: '第 12 课' },
      { id: 't11', title: '缴物业费', date: day(0), time: null, cat: 'life', done: false, note: '' },
      { id: 't12', title: '项目评委会', date: day(0), time: '14:00', cat: 'work', done: false, note: '带原型和排期' },
      { id: 't13', title: '《三体》第三章', date: day(0), time: '21:00', cat: 'study', done: false, note: '' },
      { id: 't14', title: '提交季度预算', date: day(1), time: '11:00', cat: 'work', done: false, note: '' },
      { id: 't15', title: '超市采购清单', date: day(1), time: null, cat: 'life', done: false, note: '牛奶、咖啡豆、水果' },
      { id: 't16', title: '体检预约', date: day(2), time: '09:00', cat: 'health', done: false, note: '' },
      { id: 't17', title: '团队晚餐', date: day(3), time: '18:30', cat: 'life', done: false, note: '楼下新开的云南菜' },
      { id: 't18', title: '回复未读邮件', date: day(3), time: null, cat: 'work', done: false, note: '' },
      { id: 't19', title: '健身房私教课', date: day(5), time: '19:00', cat: 'health', done: false, note: '' },
      { id: 't20', title: '设计稿走查', date: day(7), time: '11:00', cat: 'work', done: false, note: '' },
      { id: 't21', title: '给爸妈打电话', date: day(9), time: '20:00', cat: 'life', done: false, note: '' },
      { id: 't22', title: '读书笔记整理', date: day(11), time: null, cat: 'study', done: false, note: '' },
      { id: 't23', title: '月度账单核对', date: day(13), time: null, cat: 'life', done: false, note: '' },
      { id: 't24', title: '年终述职提纲', date: day(16), time: '15:00', cat: 'work', done: false, note: '' },
      { id: 't25', title: '产品周会', date: day(18), time: '10:00', cat: 'work', done: false, note: '' },
      { id: 't26', title: '预约牙医', date: day(20), time: '15:00', cat: 'health', done: false, note: '' },
      { id: 't27', title: '整理季度照片', date: day(22), time: null, cat: 'life', done: false, note: '' },
      { id: 't28', title: '年度读书清单', date: day(25), time: null, cat: 'study', done: false, note: '' },
      { id: 't29', title: '提交报销单', date: day(28), time: null, cat: 'work', done: false, note: '' }
    ]
  };

  global.DB = DB;
})(window);
