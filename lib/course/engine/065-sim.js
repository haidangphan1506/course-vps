(function (G) {
'use strict';
var C = G.COURSE;
var idx = -1, old = null;
C.lessons.forEach(function (l, i) { if (l.id === 'c5') { idx = i; old = l; } });
C.old = old;
C.pick = function (title) { var r = old.theory.filter(function (t) { return t.title === title; })[0]; if (!r) throw new Error('no card ' + title); return r; };
C.pickQ = function (prefix) { var r = old.quiz.filter(function (q) { return q.q.indexOf(prefix) === 0; })[0]; if (!r) throw new Error('no quiz ' + prefix); return r; };
C.pickD = function (id) { var r = old.debugs.filter(function (d) { return d.id === id; })[0]; if (!r) throw new Error('no debug ' + id); return r; };
var A = { id: 'c5a', group: 'Ứng dụng', short: 'Docker cơ bản', title: 'Docker cơ bản: image, container, volume và registry', dek: 'Hiểu image và container, tự build image, vào trong container, giữ dữ liệu bằng volume, đẩy image lên registry và gỡ lỗi quyền, CMD sai, thiếu image.', theory: [], quiz: [], lab: null, debugs: [] };
var B = { id: 'c5b', group: 'Ứng dụng', short: 'Compose và vận hành', title: 'Docker Compose và vận hành thực tế', dek: 'Chạy cả hệ thống tutor bằng Compose: env, mạng, thứ tự khởi động, backup và nâng cấp Postgres, triển khai tự động, rollback và gỡ lỗi nhiều lớp.', theory: [], quiz: [], lab: null, debugs: [] };
C.A = A; C.B = B;
C.lessons.splice(idx, 1, A, B);
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
