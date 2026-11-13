(function (G) {
'use strict';
/* Chương lb2: quyền và sở hữu. */
var V = G.VPS, C = G.COURSE, L = C.L, A = C.A, OK = C.OK, FAIL = C.FAIL, ftxt = C.ftxt, LB = C.LB;
function base(s, o) { LB.base(s, o); }
var AND = function () { var f = arguments; return function (s) { for (var i = 0; i < f.length; i++) if (!f[i](s)) return false; return true; }; };
var W = function (s) { return s.home + '/work/'; };
function mode(s, p) { var n = s.fs.get(p); return n ? n.mode & 4095 : -1; }
function m8(x) { return parseInt(x, 8); }

var T = {
  id: 'lb2', group: 'Linux căn bản', short: 'Quyền và sở hữu',
  title: 'Quyền và sở hữu: chmod, chown, umask, sudo',
  dek: 'Mô hình rwx cho chủ, nhóm và người khác; số 755 và 644; chown, thư mục chia sẻ với setgid, sticky bit, umask, sudo an toàn. Giải thích phần lớn lỗi Permission denied và 403.'
};
C.insertAfter('lb1', T);

T.theory = [
  { tag: 'Khái niệm', title: 'Ba đối tượng, ba quyền', body: [
    'Mỗi file và thư mục có **một chủ (user)**, **một nhóm (group)**, và ba bộ quyền: cho chủ (**u**), cho nhóm (**g**), cho mọi người khác (**o**). Khi bạn truy cập, hệ thống chọn **đúng một** bộ: nếu bạn là chủ thì dùng bộ của chủ (dù bộ của nhóm rộng hơn), nếu không thì xét nhóm, cuối cùng mới tới "người khác". root bỏ qua mọi kiểm tra.',
    { tbl: [['Quyền', 'Với **file**', 'Với **thư mục**'], ['`r` (đọc)', 'Đọc nội dung', 'Liệt kê tên bên trong (`ls`)'], ['`w` (ghi)', 'Sửa nội dung', 'Tạo, xoá, đổi tên file bên trong (cần cả `x`)'], ['`x` (thực thi)', 'Chạy như chương trình/script', 'Đi vào (`cd`) và truy cập file bên trong theo tên']] },
    { pre: ['$ ls -l scripts/deploy.sh', '-rwxr-xr-x 1 haidangphan haidangphan 88 Oct 27 10:20 scripts/deploy.sh', ' |\\_/\\_/\\_/', ' | |  |  +-- o: người khác  r-x', ' | |  +----- g: nhóm        r-x', ' | +-------- u: chủ         rwx', ' +---------- loại: - file, d thư mục, l symlink'], cap: 'Đọc quyền' },
    { pre: ['id               # uid, gid và các nhóm của bạn', 'groups           # chỉ liệt kê nhóm', 'id tutor         # của user khác'], cap: 'Xem bạn là ai' }
  ] },
  { tag: 'Bảng tra', title: 'Chế độ số: 755, 644, 600 nghĩa là gì', body: [
    'Mỗi quyền có một giá trị: **r = 4, w = 2, x = 1**. Cộng lại cho từng đối tượng, ta có ba chữ số theo thứ tự chủ, nhóm, khác.',
    { tbl: [['Số', 'Ký hiệu', 'Dùng cho'], ['`644`', '`rw-r--r--`', 'File thường (mã nguồn, cấu hình công khai)'], ['`755`', '`rwxr-xr-x`', 'Thư mục, script, chương trình'], ['`600`', '`rw-------`', 'Bí mật: `.env`, khoá riêng SSH, `authorized_keys`'], ['`700`', '`rwx------`', 'Thư mục riêng tư: `~/.ssh`'], ['`664`', '`rw-rw-r--`', 'File nhóm cùng sửa'], ['`775`', '`rwxrwxr-x`', 'Thư mục nhóm cùng làm việc'], ['`640`', '`rw-r-----`', 'File nhóm đọc, người ngoài không (như `/etc/shadow`)'], ['`777`', '`rwxrwxrwx`', 'Gần như **không bao giờ** đúng']] },
    { pre: ['stat -c \'%a %A %U:%G %n\' notes.txt     # 644 -rw-r--r-- haidangphan:haidangphan notes.txt'], cap: 'Xem dạng số' },
    { note: '`chmod 777` "cho chạy được" là phản xạ tồi: nó cho mọi user và mọi tiến trình (kể cả bị hack) sửa file. Hãy tìm xem **ai** cần quyền gì, và cấp đúng quyền đó.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'chmod: đổi quyền', body: [
    { tbl: [['Dạng', 'Ví dụ', 'Ý nghĩa'], ['Số', '`chmod 600 .env`', 'Đặt chính xác `rw-------`'], ['Ký hiệu +', '`chmod +x run.sh`', 'Thêm quyền chạy cho mọi đối tượng'], ['Ký hiệu +', '`chmod u+x,g+w file`', 'Thêm `x` cho chủ, `w` cho nhóm'], ['Ký hiệu -', '`chmod o-rwx file`', 'Bớt mọi quyền của người khác'], ['Ký hiệu =', '`chmod u=rwx,g=rx,o= file`', 'Đặt chính xác từng đối tượng'], ['Đệ quy', '`chmod -R go-w photos`', 'Áp cho cả cây thư mục']] },
    { pre: ['chmod +x scripts/backup.sh          # script chạy được bằng ./scripts/backup.sh', 'chmod 600 projects/tutor/.env      # chỉ chủ đọc/ghi', 'chmod -R u=rwX,go=rX site/          # thư mục có x, file thường không (X)'], cap: 'Ví dụ' },
    { ul: ['Chỉ **chủ** (hoặc root) mới `chmod` được file', '`X` (chữ hoa) chỉ thêm quyền chạy cho thư mục và file đã có `x`; hữu ích với `-R` để khỏi biến mọi file thành chạy được', 'Một script phải có `x` thì `./script.sh` mới chạy; không có `x` vẫn chạy được bằng `bash script.sh` (vì khi đó `bash` đọc file, nó cần `r`)'] }
  ] },
  { tag: 'Cú pháp', title: 'chown và chgrp: đổi chủ và nhóm', body: [
    { pre: ['sudo chown root:root notes.txt           # đổi chủ và nhóm', 'sudo chown haidangphan notes.txt          # chỉ đổi chủ', 'sudo chown :www-data data                 # chỉ đổi nhóm', 'sudo chgrp www-data data                 # tương tự', 'sudo chown -R www-data:www-data /var/www/site   # đệ quy'], cap: 'Cú pháp: chown CHỦ[:NHÓM] ĐƯỜNG_DẪN' },
    'Chỉ **root** mới đổi được chủ. Người thường chỉ đổi nhóm sang nhóm mà họ là thành viên.',
    { tbl: [['Tình huống', 'Cách phân quyền hay dùng'], ['Mã nguồn web do bạn deploy, Nginx chỉ đọc', 'Chủ `deploy`/bạn, nhóm `www-data`, quyền `750` thư mục, `640` file'], ['Thư mục upload ứng dụng ghi vào', 'Chủ là user chạy ứng dụng, quyền `750`'], ['Bí mật (`.env`, khoá riêng)', 'Chủ là user chạy ứng dụng, `600`'], ['File cấu hình hệ thống (`/etc/nginx`)', 'Chủ `root`, `644`']] },
    { note: 'Sai lầm nguy hiểm: `sudo chown -R user /` hoặc `chown -R` với đường dẫn có biến rỗng. Luôn kiểm tra đường dẫn bằng `ls` hoặc `echo` trước khi dùng `-R`.', kind: 'warn' }
  ] },
  { tag: 'Khái niệm', title: 'Quyền trên thư mục và "Permission denied" khi duyệt đường dẫn', body: [
    'Để truy cập `/home/haidangphan/work/site/index.html`, tiến trình cần quyền **x trên MỌI thư mục dọc đường** (`/`, `/home`, `/home/haidangphan`, `work`, `site`) và **r** trên file. Chỉ cần một thư mục chặn là bị từ chối, dù file có `644`.',
    { pre: ['namei -l /home/haidangphan/work/site/index.html', 'f: /home/haidangphan/work/site/index.html', ' drwxr-xr-x root        root        /', ' drwxr-xr-x root        root        home', ' drwxr-x--- haidangphan haidangphan haidangphan   <-- người khác không có x: Nginx (www-data) bị chặn', ' drwxr-xr-x haidangphan haidangphan work', ' -rw-r--r-- haidangphan haidangphan index.html'], cap: 'namei -l: công cụ số một để chẩn đoán' },
    { ul: ['Nginx báo `403 Forbidden` và log có `(13: Permission denied)` thường do thiếu `x` trên một thư mục cha. Ubuntu 24.04 đặt `/home/user` là `750`', 'Cách tốt hơn là **đặt mã nguồn web ở `/var/www` hoặc `/srv`**, không mở `/home` ra cho người khác', '`x` trên thư mục mà không có `r`: vẫn vào được nếu biết tên file, nhưng `ls` thì không', 'Xoá file cần `w` trên **thư mục chứa nó**, không phải trên file'] }
  ] },
  { tag: 'Khái niệm', title: 'Quyền đặc biệt: setuid, setgid, sticky bit', body: [
    { tbl: [['Bit', 'Số', 'Hiển thị', 'Tác dụng'], ['setuid', '`4000`', '`rws`', 'File chạy với quyền của **chủ file** (ví dụ `/usr/bin/passwd` chạy như root)'], ['setgid trên thư mục', '`2000`', '`rwxrwsr-x`', 'File mới trong đó **kế thừa nhóm** của thư mục, lý tưởng cho thư mục dùng chung'], ['sticky trên thư mục', '`1000`', '`rwxrwxrwt`', 'Chỉ chủ file (hoặc root) được xoá file của mình, như `/tmp`']] },
    { pre: ['sudo mkdir /srv/shared', 'sudo chgrp devs /srv/shared', 'sudo chmod 2775 /srv/shared        # setgid + rwxrwxr-x', 'ls -ld /srv/shared                  # drwxrwsr-x ... root devs', 'ls -ld /tmp                        # drwxrwxrwt: sticky', 'find / -perm -4000 -type f 2>/dev/null   # liệt kê chương trình setuid (kiểm tra bảo mật)'], cap: 'Thư mục dùng chung cho nhóm' },
    { note: 'Chương trình setuid của root là mục tiêu tấn công hấp dẫn. Không bao giờ đặt setuid (`chmod u+s`) lên script hay chương trình tự viết.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'umask: quyền mặc định của file mới', body: [
    'File mới được tạo với quyền gốc **666** (file) hoặc **777** (thư mục), rồi **trừ đi** `umask`.',
    { tbl: [['umask', 'File mới', 'Thư mục mới', 'Dùng khi'], ['`022`', '`644`', '`755`', 'Mặc định thường gặp'], ['`002`', '`664`', '`775`', 'Làm việc nhóm với setgid'], ['`077`', '`600`', '`700`', 'Riêng tư tuyệt đối']] },
    { pre: ['umask                 # xem hiện tại: 0022', 'umask 077             # chỉ áp cho phiên shell này', 'touch private.txt     # -rw-------', 'umask 022             # đặt lại'], cap: 'Dùng umask' },
    'Muốn umask vĩnh viễn cho một user: đặt trong `~/.bashrc`. Cho một dịch vụ systemd: `UMask=0027` trong file unit.',
    'Trên Ubuntu, user thường có nhóm riêng trùng tên nên `umask` thường là `0002` (file mới `664`), còn root và nhiều dịch vụ dùng `0022`. Hãy chạy `umask` trên máy của bạn trước khi suy ra quyền của file mới. Terminal giả lập trong khoá hiển thị `0022`.'
  ] },
  { tag: 'Cú pháp', title: 'sudo, nhóm và nguyên tắc ít đặc quyền', body: [
    { tbl: [['Lệnh', 'Tác dụng'], ['`sudo lệnh`', 'Chạy một lệnh với quyền root'], ['`sudo -u tutor lệnh`', 'Chạy như user khác'], ['`sudo -l`', 'Xem bạn được phép chạy gì'], ['`sudo -i`', 'Mở shell root (hạn chế dùng)'], ['`sudo visudo`', 'Sửa `/etc/sudoers` có kiểm tra cú pháp'], ['`sudo useradd -m -s /bin/bash deploy`', 'Tạo user có home'], ['`sudo usermod -aG devs tutor`', '**Thêm** `tutor` vào nhóm `devs` (nhớ `-a`)'], ['`sudo groupadd devs`', 'Tạo nhóm']] },
    { pre: ['echo \'tutor ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart tutor\' | sudo tee /etc/sudoers.d/tutor', 'sudo chmod 440 /etc/sudoers.d/tutor', 'sudo visudo -c                     # kiểm tra cú pháp'], cap: 'Cho user cụ thể chạy đúng một lệnh' },
    { ul: ['`usermod -G` (không có `-a`) **thay thế** toàn bộ nhóm phụ, có thể làm mất quyền sudo. Luôn dùng `-aG`', 'Nhóm mới chỉ có hiệu lực ở **phiên đăng nhập mới**: sau `usermod -aG`, phải thoát và vào lại (`id` mới thấy nhóm)', 'Dịch vụ nên chạy bằng user riêng, không phải root (xem chương Bảo mật)', '`sudo echo x > /file` **không** hoạt động: phần `>` do shell của bạn thực hiện chứ không phải sudo. Dùng `echo x | sudo tee /file`'] }
  ] },
  { tag: 'Lưu ý', title: 'Lỗi thường gặp và danh sách kiểm tra', body: [
    { tbl: [['Triệu chứng', 'Nguyên nhân', 'Cách sửa'], ['`./run.sh: Permission denied`', 'Script thiếu `x`', '`chmod +x run.sh`'], ['`cat: file: Permission denied`', 'Không đủ `r`, hoặc thư mục cha thiếu `x`', '`ls -l`, `namei -l đường-dẫn`'], ['Nginx `403` / `(13: Permission denied)`', 'www-data không đi qua được thư mục cha', '`namei -l`; đặt site ở `/var/www`'], ['`npm EACCES` khi ghi', 'Thư mục thuộc root', '`chown` cho đúng user thay vì chạy bằng sudo'], ['`sudo echo > file` bị từ chối', '`>` chạy bằng shell thường', '`| sudo tee`'], ['Đã thêm nhóm nhưng vẫn bị từ chối', 'Phiên cũ chưa nhận nhóm mới', 'Thoát và đăng nhập lại; `id` để kiểm tra'], ['`ssh` báo `UNPROTECTED PRIVATE KEY`', 'Khoá riêng có quyền quá rộng', '`chmod 600 ~/.ssh/id_ed25519`'], ['`sudo: unable to resolve host`', 'Không liên quan quyền: lỗi hostname', 'Sửa `/etc/hosts`']] },
    { ul: ['Đã xem `ls -l` và `namei -l` của đúng đường dẫn đang lỗi chưa?', 'Tiến trình đang chạy bằng user nào (`ps aux`, `id`)?', 'Có đang định `chmod 777` hay `chown -R` bừa không? Hãy hỏi "ai cần quyền gì" trước', 'Bí mật có `600` và chủ đúng chưa?'] }
  ] }
];

T.theory.push({"tag": "Bảng lệnh", "title": "Bảng giải thích từng lệnh và kết quả", "body": [{"tbl": [["Lệnh", "Giải thích", "Kết quả khi chạy"], ["`id`", "Xem UID, GID và các nhóm mà người dùng hiện tại thuộc về.", "uid=1000(haidangphan) gid=1000(haidangphan) groups=1000(haidangphan),27(sudo)"], ["`ls -l scripts`", "Xem quyền, chủ và nhóm của từng file trong scripts.", "total 8 / -rw-r--r-- 1 haidangphan haidangphan 85 Oct 27 10:20 backup.sh / -rwxr-xr-x 1 haidangphan haidangphan 84 Oct 27 10:20 deploy.sh"], ["`./scripts/backup.sh`", "Chạy script khi chưa có quyền thực thi: bị từ chối với Permission denied.", "bash: ./scripts/backup.sh: Permission denied"], ["`chmod +x scripts/backup.sh`", "Thêm quyền thực thi (x) cho mọi người.", "(không in ra)"], ["`touch secret.txt`", "Tạo file rỗng secret.txt.", "(không in ra)"], ["`chmod 600 secret.txt`", "Đặt quyền 600: chủ đọc và ghi, nhóm và người khác không có quyền.", "(không in ra)"], ["`touch tool.sh`", "Tạo file rỗng tool.sh để thử quyền.", "(không in ra)"], ["`chmod u=rwx,g=rx,o= tool.sh`", "Đặt quyền bằng ký hiệu chữ: chủ rwx, nhóm rx, người khác không có gì (tương đương 750).", "(không in ra)"], ["`stat -c '%a %A %U:%G %n' tool.sh`", "stat in quyền dạng số (%a), quyền chữ (%A), chủ:nhóm (%U:%G) và tên (%n).", "750 -rwxr-x--- haidangphan:haidangphan tool.sh"], ["`chmod -R go-w photos`", "Bỏ quyền ghi (w) của nhóm và người khác trên toàn bộ cây photos (-R đệ quy).", "(không in ra)"], ["`chmod 750 reports`", "Đặt quyền 750 cho thư mục reports.", "(không in ra)"], ["`touch rootfile.txt`", "Tạo file rootfile.txt thuộc người dùng hiện tại.", "(không in ra)"], ["`sudo chown root:root rootfile.txt`", "Đổi chủ sở hữu và nhóm sang root; cần sudo vì chỉ root mới đổi được chủ.", "(không in ra)"], ["`sudo touch rootonly.txt`", "Tạo file bằng quyền root, nên file thuộc root.", "(không in ra)"], ["`sudo chmod 600 rootonly.txt`", "Đặt quyền 600 cho file của root: người dùng thường không đọc được.", "(không in ra)"], ["`cat rootonly.txt`", "Thử đọc file của root: bị từ chối vì quyền không cho phép.", "cat: /home/haidangphan/work/rootonly.txt: Permission denied"], ["`sudo chgrp www-data data`", "Đổi nhóm của thư mục data sang www-data.", "(không in ra)"], ["`sudo chown -R haidangphan:www-data projects/tutor/src`", "Đổi chủ và nhóm cho toàn bộ cây src; -R áp dụng cho mọi mục bên trong.", "(không in ra)"], ["`cat /etc/shadow`", "Đọc file mật khẩu bị từ chối: chỉ root mới đọc được.", "cat: /etc/shadow: Permission denied"], ["`sudo cat /etc/shadow | head -2`", "Đọc bằng sudo rồi chỉ hiện 2 dòng đầu. Không đưa nội dung này lên mạng.", "root:*:19900:0:99999:7::: / haidangphan:$y$j9T$abc$xyz:19900:0:99999:7:::"], ["`ls -l /etc/passwd /etc/shadow`", "So sánh quyền của /etc/passwd (đọc cho mọi người) và /etc/shadow (chỉ root và nhóm shadow).", "-rw-r--r-- 1 root root   295 Oct 27 10:20 /etc/passwd / -rw-r----- 1 root shadow  72 Oct 27 10:20 /etc/shadow"], ["`namei -l /home/haidangphan/work/notes.txt`", "Hiện quyền của từng đoạn đường dẫn. Lỗi truy cập thường nằm ở một thư mục cha.", "f: /home/haidangphan/work/notes.txt /  drwxr-xr-x root        root        / /  drwxr-xr-x root        root        home /  drwxr-xr-x haid…"], ["`sudo groupadd devs`", "Tạo nhóm mới tên devs.", "(không in ra)"], ["`sudo usermod -aG devs tutor`", "Thêm user tutor vào nhóm devs. -a là thêm, nếu thiếu -a thì mất các nhóm cũ.", "(không in ra)"], ["`sudo mkdir /srv/shared`", "Tạo thư mục /srv/shared; cần sudo vì /srv thuộc root.", "(không in ra)"], ["`sudo chgrp devs /srv/shared`", "Đặt nhóm devs cho thư mục /srv/shared.", "(không in ra)"], ["`sudo chmod 2775 /srv/shared`", "2775: bit 2 (setgid) để file mới trong thư mục giữ nhóm devs; quyền 775 cho chủ và nhóm.", "(không in ra)"], ["`ls -ld /srv/shared /tmp`", "-d xem chính thư mục thay vì nội dung. s ở quyền nhóm là setgid, t ở /tmp là sticky bit.", "drwxrwsr-x 2 root devs 4096 Oct 27 10:20 /srv/shared / drwxrwxrwt 2 root root 4096 Oct 27 10:20 /tmp"], ["`find / -perm -4000 -type f 2>/dev/null`", "Tìm file có bit SUID (-4000). 2>/dev/null ẩn các lỗi quyền truy cập.", "/usr/bin/chfn / /usr/bin/mount / /usr/bin/passwd / /usr/bin/su"], ["`umask`", "Xem quyền mặc định khi tạo file mới: 0022.", "0022"], ["`umask 077`", "Đặt umask 077: file và thư mục mới chỉ chủ mới truy cập được.", "(không in ra)"], ["`touch private.txt`", "File mới được tạo theo umask 077 nên quyền chặt hơn.", "(không in ra)"], ["`mkdir private`", "Thư mục mới cũng chỉ chủ truy cập.", "(không in ra)"], ["`umask 022`", "Trả umask về 022 mặc định.", "(không in ra)"], ["`sudo -l`", "Liệt kê những lệnh người dùng được phép chạy bằng sudo.", "Matching Defaults entries for haidangphan on vps: /     env_reset, mail_badpass, secure_path=/usr/local/sbin\\:/usr/local/bin\\:/usr/sbin\\:…"], ["`sudo -u tutor whoami`", "Chạy whoami với tư cách user tutor, kết quả in ra tutor.", "tutor"], ["`echo \"net.core.somaxconn=1024\" | sudo tee /etc/sysctl.d/99-tutor.conf`", "Ghi dòng cấu hình vào file trong /etc bằng tee với sudo. tee in lại nội dung ra màn hình.", "net.core.somaxconn=1024"], ["`echo 'tutor ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart tutor' | sudo tee /etc/sudoers.d/tutor`", "Tạo quy tắc sudo cho user tutor: chỉ được khởi động lại dịch vụ tutor, không cần mật khẩu.", "tutor ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart tutor"], ["`sudo chmod 440 /etc/sudoers.d/tutor`", "Quyền 440 là quyền đúng cho file trong /etc/sudoers.d.", "(không in ra)"], ["`sudo visudo -c`", "Kiểm tra cú pháp sudoers. Nếu sai thì sudo sẽ hỏng, nên luôn chạy lệnh này trước.", "/etc/sudoers: parsed OK / /etc/sudoers.d/tutor: parsed OK"], ["`sudo useradd -m -s /bin/bash deploy`", "Tạo user deploy, có thư mục home (-m) và shell bash (-s).", "(không in ra)"], ["`touch /etc/hello`", "Người dùng thường không ghi được vào /etc nên bị từ chối.", "touch: cannot touch '/etc/hello': Permission denied"]]}]});
T.quiz = C.QZ(6, [
  ['`-rwxr-x---` nghĩa là gì?', 'Chủ: đọc, ghi, chạy; nhóm: đọc, chạy; người khác: không có gì', ['Mọi người đều chạy được', 'Chủ chỉ đọc; nhóm ghi', 'Chủ và nhóm đọc ghi, người khác chạy'], 'Chín ký tự chia 3 nhóm: u=`rwx`, g=`r-x`, o=`---`.'],
  ['Chế độ số `640` tương ứng?', '`rw-r-----`', ['`rwxr-----`', '`rw-rw----`', '`r--r--r--`'], '6=4+2 (rw), 4 (r), 0.'],
  ['Cách đặt `.env` chỉ chủ đọc/ghi?', '`chmod 600 .env`', ['`chmod 644 .env`', '`chmod +x .env`', '`chmod 400 -R .env`'], '600 = `rw-------`.'],
  ['`chmod u=rwx,g=rx,o= file` cho kết quả?', '`750`', ['`755`', '`705`', '`570`'], 'u=rwx (7), g=rx (5), o rỗng (0).'],
  ['Để `cd` vào một thư mục, bạn cần quyền nào trên nó?', '`x`', ['`r`', '`w`', 'Chỉ cần là chủ'], 'Quyền `x` trên thư mục là quyền "đi qua". `r` chỉ để liệt kê.'],
  ['Nginx (www-data) trả 403 dù file `index.html` là `644`. Nguyên nhân hay gặp nhất?', 'Một thư mục cha (ví dụ `/home/user`) không cho "người khác" quyền `x`', ['File cần `777`', 'Nginx chưa được cài', 'File phải thuộc root'], 'Dùng `namei -l` để xem từng cấp. Giải pháp tốt: đặt site ở `/var/www`.'],
  ['Chỉ ai đổi được chủ (`chown`) của một file sang user khác?', 'root', ['Chủ hiện tại', 'Bất kỳ ai trong nhóm', 'Mọi user'], 'Chủ file chỉ đổi được nhóm (sang nhóm mình thuộc), không tặng file cho người khác.'],
  ['`ls -ld /tmp` hiện `drwxrwxrwt`. Chữ `t` có nghĩa?', 'Sticky bit: chỉ chủ file mới xoá được file của mình', ['Thư mục tạm, tự xoá sau 1 giờ', 'File chạy được với quyền root', 'Chỉ đọc'], 'Sticky bit cho phép ai cũng tạo file nhưng không xoá file của người khác.'],
  ['Thư mục dùng chung của nhóm `devs`, muốn file mới tự thuộc nhóm `devs`. Dùng?', 'Bit setgid: `chmod 2775` và nhóm `devs`', ['`chmod 777`', 'setuid: `chmod 4775`', 'Sticky: `chmod 1775`'], 'setgid trên thư mục làm file mới kế thừa nhóm của thư mục.'],
  ['`umask 077` làm file mới có quyền?', '`600`', ['`077`', '`700`', '`644`'], '666 − 077 = 600; thư mục: 777 − 077 = 700.'],
  ['Vì sao `sudo echo "x" >> /etc/file.conf` báo Permission denied?', 'Phần `>>` do shell của bạn thực hiện, không chạy bằng sudo', ['sudo không hỗ trợ echo', 'File đang bị khoá', 'Phải dùng `sudo -i`'], 'Dùng `echo "x" | sudo tee -a /etc/file.conf`.'],
  ['Vừa chạy `sudo usermod -aG devs haidangphan` nhưng vẫn không ghi được vào thư mục của nhóm. Nên làm gì?', 'Thoát và đăng nhập lại để phiên mới nhận nhóm', ['Chạy lại `usermod` với `-G`', '`chmod 777` thư mục', 'Khởi động lại dịch vụ Nginx'], 'Nhóm được nạp lúc đăng nhập. `id` sẽ cho thấy nhóm mới sau khi vào lại.']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { base(s); },
  items: [
    { text: 'Xem UID của bạn bằng `id -u`.', hint: 'id -u', check: OK(/^id -u$/) },
    { text: 'Xem quyền các file trong `projects/tutor/src` bằng `ls -l`.', hint: 'ls -l projects/tutor/src', check: OK(/^ls -l projects\/tutor\/src\/?$/) },
    { text: 'Thử chạy `./logs/app.log` (không phải chương trình, không có `x`) để thấy lỗi.', hint: './logs/app.log', check: FAIL(/^\.\/logs\/app\.log$/) },
    { text: 'Cấp quyền chạy cho chủ file `scripts/backup.sh` bằng `chmod u+x`, rồi chạy nó.', hint: 'chmod u+x scripts/backup.sh\n./scripts/backup.sh', check: AND(function (s) { return (mode(s, W(s) + 'scripts/backup.sh') & 64) > 0; }, OK(/^\.\/scripts\/backup\.sh$/)) },
    { text: 'Tạo `token.txt` và đặt chế độ số `400`.', hint: 'touch token.txt\nchmod 400 token.txt', check: function (s) { return mode(s, W(s) + 'token.txt') === m8('400'); } },
    { text: 'Tạo `deploy.log` và dùng ký hiệu `u=rw,g=r,o=` để được `640`.', hint: 'touch deploy.log\nchmod u=rw,g=r,o= deploy.log', check: function (s) { return mode(s, W(s) + 'deploy.log') === m8('640'); } },
    { text: 'Xem quyền dạng số của `token.txt` bằng `stat -c`.', hint: "stat -c '%a %n' token.txt", check: OK(/^stat -c %a %n token\.txt$/) },
    { text: 'Bớt quyền ghi của nhóm và người khác trên cây `projects/tutor/src` bằng `-R`.', hint: 'chmod -R go-w projects/tutor/src', check: function (s) { var ok = true; Object.keys(s.fs.n).forEach(function (k) { if (k.indexOf(W(s) + 'projects/tutor/src') === 0 && (s.fs.n[k].mode & 18)) ok = false; }); return ok && OK(/^chmod -R go-w projects\/tutor\/src$/)(s); } },
    { text: 'Đặt thư mục `logs` thành `750` bằng chế độ số.', hint: 'chmod 750 logs', check: function (s) { return mode(s, W(s) + 'logs') === m8('750'); } },
    { text: 'Tạo `motd.txt` rồi đặt nhóm của nó thành `root` bằng `sudo chgrp root`.', hint: 'touch motd.txt\nsudo chgrp root motd.txt', check: function (s) { var n = s.fs.get(W(s) + 'motd.txt'); return !!n && n.group === 'root'; } },
    { text: 'Tạo `vault.txt` bằng sudo, đặt `600`, rồi thử `cat` để thấy lỗi.', hint: 'sudo touch vault.txt\nsudo chmod 600 vault.txt\ncat vault.txt', check: FAIL(/^cat vault\.txt$/) },
    { text: 'Chuyển nhóm của thư mục `logs` sang `www-data`.', hint: 'sudo chgrp www-data logs', check: function (s) { var n = s.fs.get(W(s) + 'logs'); return !!n && n.group === 'www-data'; } },
    { text: 'Đặt cả cây `projects/tutor/node_modules` về chủ `haidangphan`, nhóm `www-data` bằng `chown -R`.', hint: 'sudo chown -R haidangphan:www-data projects/tutor/node_modules', check: function (s) { var n = s.fs.get(W(s) + 'projects/tutor/node_modules/left-pad/index.js'); return !!n && n.owner === 'haidangphan' && n.group === 'www-data'; } },
    { text: 'Đọc thử `/etc/sudoers` khi không có sudo, rồi đọc bằng sudo (lấy 3 dòng đầu).', hint: 'cat /etc/sudoers\nsudo cat /etc/sudoers | head -3', check: AND(FAIL(/^cat \/etc\/sudoers$/), OK(/^sudo cat \/etc\/sudoers$/)) },
    { text: 'So sánh quyền của `/etc/sudoers` và thư mục `/etc/sudoers.d`.', hint: 'ls -l /etc/sudoers /etc/sudoers.d', check: OK(/^ls -l \/etc\/sudoers \/etc\/sudoers\.d$/) },
    { text: 'Chẩn đoán đường dẫn `projects/tutor/src/app.js` bằng `namei -l`.', hint: 'namei -l /home/haidangphan/work/projects/tutor/src/app.js', check: OK(/^namei -l \/home\/haidangphan\/work\/projects\/tutor\/src\/app\.js$/) },
    { text: 'Tạo nhóm `qa` và thêm user `tutor` vào đó.', hint: 'sudo groupadd qa\nsudo usermod -aG qa tutor', check: AND(OK(/^sudo groupadd qa$/), OK(/^sudo usermod -aG qa tutor$/)) },
    { text: 'Tạo thư mục `/srv/team` cho nhóm `qa`, quyền `2770` (setgid, nhóm đọc ghi, người khác không vào).', hint: 'sudo mkdir /srv/team\nsudo chgrp qa /srv/team\nsudo chmod 2770 /srv/team', check: function (s) { var n = s.fs.get('/srv/team'); return !!n && n.group === 'qa' && (n.mode & 4095) === m8('2770'); } },
    { text: 'Xem quyền thư mục `/usr/bin` và `/srv/team` bằng `ls -ld`.', hint: 'ls -ld /usr/bin /srv/team', check: OK(/^ls -ld \/usr\/bin \/srv\/team$/) },
    { text: 'Liệt kê các chương trình setuid trong `/usr/bin`.', hint: 'find /usr/bin -perm -4000 -type f 2>/dev/null', check: A(/^find \/usr\/bin -perm -4000 -type f$/) },
    { text: 'Đặt `umask 027`, xem lại, rồi kiểm tra bằng `umask`.', hint: 'umask 027\numask', check: AND(OK(/^umask 027$/), OK(/^umask$/)) },
    { text: 'Đặt `umask 077`, tạo `secret-notes.txt` và thư mục `vault`, rồi đặt lại `022`.', hint: 'umask 077\ntouch secret-notes.txt\nmkdir vault\numask 022', check: function (s) { return mode(s, W(s) + 'secret-notes.txt') === m8('600') && mode(s, W(s) + 'vault') === m8('700') && (s.fs.umask == null || s.fs.umask === 18); } },
    { text: 'Đọc quyền sudo của user `tutor` bằng `sudo -l -U tutor`.', hint: 'sudo -l -U tutor', check: OK(/^sudo -l -U tutor$/) },
    { text: 'Chạy `id -un` dưới quyền user `tutor` bằng `sudo -u`.', hint: 'sudo -u tutor id -un', check: OK(/^sudo -u tutor id -un$/) },
    { text: 'Ghi `vm.swappiness=10` vào `/etc/sysctl.d/99-tutor.conf` bằng `sudo tee`.', hint: 'echo "vm.swappiness=10" | sudo tee /etc/sysctl.d/99-tutor.conf', check: function (s) { return /vm\.swappiness=10/.test(ftxt(s, '/etc/sysctl.d/99-tutor.conf')); } },
    { text: 'Cho `tutor` chạy riêng lệnh `status` của dịch vụ tutor qua file `/etc/sudoers.d/tutor-status` và đặt quyền `440`.', hint: "echo 'tutor ALL=(ALL) NOPASSWD: /usr/bin/systemctl status tutor' | sudo tee /etc/sudoers.d/tutor-status\nsudo chmod 440 /etc/sudoers.d/tutor-status", check: function (s) { return /NOPASSWD: \/usr\/bin\/systemctl status tutor/.test(ftxt(s, '/etc/sudoers.d/tutor-status')) && mode(s, '/etc/sudoers.d/tutor-status') === m8('440'); } },
    { text: 'Kiểm tra cú pháp file sudoers vừa tạo.', hint: 'sudo visudo -c -f /etc/sudoers.d/tutor-status', check: OK(/^sudo visudo -c -f \/etc\/sudoers\.d\/tutor-status$/) },
    { text: 'Tạo user `backup` có home và shell bash.', hint: 'sudo useradd -m -s /bin/bash backup', check: OK(/^sudo useradd -m -s \/bin\/bash backup$/) },
    { text: 'Đọc lỗi: thử tạo file trong `/etc` khi không có quyền.', hint: 'touch /etc/motd.new', check: FAIL(/^touch \/etc\/motd\.new$/) }
  ]
};

var RUNSH = ['#!/bin/bash', 'echo "xong" > ran.txt'];
var SYSCTL_LINE = 'net.core.somaxconn = 1024';
T.debugs = [
  {
    id: 'lb2d1', title: 'Script chạy bằng ./run.sh bị Permission denied',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./run.sh', 'bash: ./run.sh: Permission denied', '$ ls -l run.sh', '-rw-r--r-- 1 haidangphan haidangphan 34 Oct 27 10:20 run.sh'),
    story: 'Bạn chép script `run.sh` về từ máy khác. Chạy bằng `./run.sh` thì bị từ chối, dù bạn là chủ file.',
    goal: 'Chạy `./run.sh` thành công và tạo ra file `ran.txt`.',
    hints: ['`ls -l run.sh`. Ba ký tự đầu của quyền (của chủ) là gì?', 'Chỉ có `rw-`, thiếu `x` (thực thi). Không có `x` thì `./run.sh` không chạy được.', 'Thêm quyền: `chmod +x run.sh`, rồi `./run.sh` và `cat ran.txt`.'],
    fix: ['ls -l run.sh', 'chmod +x run.sh', './run.sh', 'cat ran.txt'],
    cause: 'Chạy `./file` đòi quyền `x`. File chép từ nơi khác, tải về, hoặc tạo bằng trình soạn thảo thường là `644`. `bash run.sh` vẫn chạy (vì chỉ cần đọc) nhưng cron và systemd thường gọi trực tiếp nên cần `x`.',
    setup: function (s) { base(s, { setup: function (s2, l, h) { LB.put(s2, h + '/run.sh', RUNSH.join('\n') + '\n', { mode: 420 }); } }); },
    check: function (s) { return ftxt(s, W(s) + 'ran.txt').trim() === 'xong'; }
  },
  {
    id: 'lb2d2', title: 'Nginx trả 403 dù index.html là 644',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ curl -I http://localhost/', 'HTTP/1.1 403 Forbidden', '$ sudo tail -1 /var/log/nginx/error.log', '*1 open() "/home/haidangphan/work/site/index.html" failed (13: Permission denied)', '$ ls -l site/index.html', '-rw-r--r-- 1 haidangphan haidangphan 20 Oct 27 10:20 site/index.html'),
    story: 'Nginx (chạy bằng `www-data`) phục vụ `/home/haidangphan/work/site/index.html`. File là `644` nhưng vẫn 403. Thư mục home của bạn là `750`, thư mục `work` là `700`.',
    goal: 'Người khác (www-data) phải đi qua được mọi thư mục cha và đọc được file: các thư mục dọc đường phải có `x` cho "other", file có `r`.',
    hints: ['`namei -l /home/haidangphan/work/site/index.html` cho thấy quyền từng cấp. Cấp nào không có `x` ở cột cuối?', 'Thư mục home (`750`) và `work` (`700`) không cho "người khác" quyền đi qua (`x`).', 'Mở `x` cho người khác: `chmod o+x ~ ~/work`, rồi `namei -l ...` để kiểm tra lại. (Lâu dài nên đặt site ở `/var/www`.)'],
    fix: ['namei -l /home/haidangphan/work/site/index.html', 'chmod o+x ~ ~/work', 'namei -l /home/haidangphan/work/site/index.html'],
    cause: 'Truy cập file cần `x` trên mọi thư mục cha. Chỉ cần home `750` là www-data không qua được. `chmod o+x` là cách chữa nhanh; cách tốt hơn là đặt thư mục web ở `/var/www` hoặc `/srv`, thuộc nhóm `www-data`, để không phải mở thư mục home.',
    setup: function (s) { base(s, { setup: function (s2, l, h) {
      s2.fs.mkdirp(h + '/site', s2.user, 493); LB.put(s2, h + '/site/index.html', '<h1>Tutor</h1>\n');
      s2.fs.n[s2.home].mode = m8('750'); s2.fs.n[h].mode = m8('700');
    } }); },
    check: function (s) {
      var parts = (s.home + '/work/site').split('/').filter(Boolean), cur = '', ok = true;
      parts.forEach(function (p) { cur += '/' + p; var n = s.fs.n[cur]; if (n && !(n.mode & 1)) ok = false; });
      var f = s.fs.get(W(s) + 'site/index.html'); return ok && !!f && !!(f.mode & 4);
    }
  },
  {
    id: 'lb2d3', title: 'Ghi cấu hình sysctl bằng sudo echo vẫn bị từ chối',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ sudo echo "net.core.somaxconn = 1024" >> /etc/sysctl.d/99-tutor.conf', 'bash: /etc/sysctl.d/99-tutor.conf: Permission denied'),
    story: 'Bạn đã dùng `sudo` rồi nhưng việc ghi vào file trong `/etc` vẫn báo Permission denied.',
    goal: 'File `/etc/sysctl.d/99-tutor.conf` chứa dòng `net.core.somaxconn = 1024`.',
    hints: ['`sudo` chỉ áp cho lệnh `echo`. Ai là người mở file để ghi qua dấu `>>`?', 'Dấu `>>` do **shell của bạn** (không có quyền) thực hiện trước khi `sudo` chạy.', 'Cho phần ghi file chạy bằng sudo: `echo "net.core.somaxconn = 1024" | sudo tee -a /etc/sysctl.d/99-tutor.conf`.'],
    fix: ['echo "net.core.somaxconn = 1024" | sudo tee -a /etc/sysctl.d/99-tutor.conf', 'cat /etc/sysctl.d/99-tutor.conf'],
    cause: 'Chuyển hướng `>` `>>` được shell xử lý trước khi lệnh chạy, nên không được hưởng sudo. Giải pháp: `lệnh | sudo tee file` (thêm `-a` để nối), hoặc `sudo bash -c \'lệnh > file\'`.',
    setup: function (s) { base(s); },
    check: function (s) { return ftxt(s, '/etc/sysctl.d/99-tutor.conf').indexOf(SYSCTL_LINE) >= 0; }
  },
  {
    id: 'lb2d4', title: 'Đã thêm vào nhóm devs nhưng vẫn không ghi được /srv/shared', hard: true,
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ls -ld /srv/shared', 'drwxrwxr-x 2 root devs 4096 Oct 27 10:20 /srv/shared', '$ getent group devs', 'devs:x:1100:haidangphan', '$ touch /srv/shared/ok.txt', 'touch: cannot touch \'/srv/shared/ok.txt\': Permission denied', '$ id', 'uid=1000(haidangphan) gid=1000(haidangphan) groups=1000(haidangphan),27(sudo)'),
    story: 'Quản trị viên đã thêm bạn vào nhóm `devs` (thư mục `/srv/shared` thuộc nhóm này, quyền 775). `getent group devs` có tên bạn, nhưng ghi file vẫn bị từ chối.',
    goal: 'Tạo được file `/srv/shared/ok.txt`.',
    hints: ['So sánh `getent group devs` với `id`. Nhóm `devs` có trong `id` không?', 'Nhóm chỉ được nạp lúc đăng nhập. Phiên SSH hiện tại vẫn mang danh sách nhóm cũ.', 'Thoát phiên và vào lại (`exit`), kiểm tra `id` có `devs`, rồi `touch /srv/shared/ok.txt`.'],
    fix: ['id', 'exit', 'id', 'touch /srv/shared/ok.txt'],
    cause: 'Quyền nhóm của một tiến trình được cố định khi đăng nhập. Sửa `/etc/group` hay `usermod -aG` không ảnh hưởng phiên đang mở. Đăng nhập lại (hoặc `newgrp devs` cho một shell tạm) mới có nhóm mới. Hãy so sánh `id` và `getent group` mỗi khi nghi ngờ.',
    setup: function (s) { base(s, { setup2: function (s2) {
      V.lin2.addGroup(s2, 'devs', ['haidangphan']);
      s2.fs.mkdirp('/srv/shared', 'root', m8('775')); s2.fs.n['/srv/shared'].group = 'devs';
    } }); },
    check: function (s) { return !!s.fs.get('/srv/shared/ok.txt'); }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
