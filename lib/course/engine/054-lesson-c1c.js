(function (G) {
'use strict';
/* Chương c1c: Gói, người dùng, đĩa, mạng, truyền file. */
var V = G.VPS, C = G.COURSE, L = C.L, A = C.A, OK = C.OK, FAIL = C.FAIL, LIN = V.lin, L2 = V.lin2;
var ftxt = C.ftxt;
var quiet = { out: function () {}, err: function () {}, sudo: true };

function base(s, o) {
  o = o || {};
  C.linBase(s, { runaway: false, vdb: !!o.vdb, setup: o.setup, setup2: function (s2, S, l) {
    s2.fs.put('/etc/hosts', ftxt(s2, '/etc/hosts') + (o.noBackupHost ? '' : ''), { owner: 'root', mode: 420 });
    if (o.upg) L2.startUpgrader(s2, o.upg);
    if (o.setup2) o.setup2(s2, S, l);
  } });
}
function addBackupHost(s) { s.fs.put('/etc/hosts', ftxt(s, '/etc/hosts') + '10.0.0.20 backup\n', { owner: 'root', mode: 420 }); }

var D = {
  id: 'c1c', group: 'Nền tảng', short: 'Gói, user, đĩa, mạng',
  title: 'Gói, người dùng, đĩa, mạng và truyền file',
  dek: 'Cài và giữ phiên bản phần mềm bằng apt, chia quyền cho nhóm, chẩn đoán đầy đĩa và đầy inode, thêm swap, kiểm tra mạng và DNS, sao lưu bằng tar và rsync.'
};
C.insertAfter('c1b', D);

D.theory = [
  { tag: 'Khái niệm', title: 'apt: bốn bước cài và cập nhật phần mềm', body: [
    'Ubuntu/Debian quản lý phần mềm dưới dạng **gói** (`.deb`) lấy từ các **kho** (repository). `apt` là giao diện dòng lệnh; `dpkg` là công cụ cấp thấp cài từng file `.deb`.',
    { tbl: [['Lệnh', 'Làm gì'], ['`sudo apt update`', 'Tải **danh sách** gói mới nhất từ kho. Không cài gì cả'], ['`apt list --upgradable`', 'Gói nào có bản mới'], ['`sudo apt upgrade -y`', 'Nâng cấp mọi gói đã cài (không xoá gói nào)'], ['`sudo apt install -y nginx`', 'Cài gói cùng các gói phụ thuộc'], ['`sudo apt remove nginx`', 'Gỡ chương trình, **giữ** file cấu hình'], ['`sudo apt purge nginx`', 'Gỡ cả file cấu hình'], ['`sudo apt autoremove`', 'Dọn gói phụ thuộc không còn ai dùng'], ['`apt search từ-khoá` / `apt show gói`', 'Tìm và xem thông tin']] },
    { note: 'Luôn `apt update` trước `apt install`. Danh sách gói cũ làm `install` báo "Unable to locate package" hoặc cài bản cũ. Bỏ `-y` nếu muốn đọc kỹ danh sách trước khi đồng ý.', kind: 'warn' },
    { pre: ['sudo apt update && sudo apt upgrade -y', 'apt-cache policy openssl        # đã cài bản nào, bản ứng viên là gì, từ kho nào', 'dpkg -l | grep nginx          # nginx đã cài chưa, bản nào', 'dpkg -L nginx | head          # gói này đã ghi file nào'], cap: 'Kiểm tra trạng thái gói' }
  ] },
  { tag: 'Khái niệm', title: 'Kho phụ, PPA, NodeSource và giữ phiên bản', body: [
    'Kho Ubuntu thường có Node.js bản cũ. Muốn bản mới bạn thêm **kho phụ** do nhà phát triển cung cấp. Danh sách kho nằm ở `/etc/apt/sources.list` và `/etc/apt/sources.list.d/*.sources`.',
    { pre: ['curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -   # thêm kho NodeSource', 'apt-cache policy nodejs        # bản ứng viên giờ là 22.x', 'sudo apt install -y nodejs', 'node -v', '', 'sudo add-apt-repository ppa:deadsnakes/ppa   # PPA (cần software-properties-common)', 'cat /etc/apt/sources.list.d/*.sources'], cap: 'Thêm kho' },
    { ul: ['Chỉ thêm kho của nguồn bạn tin. Kho phụ có thể thay thế cả gói hệ thống', 'Pipe `curl | sudo bash` chạy thẳng script từ mạng với quyền root: nên tải về đọc trước (`curl -o x.sh ...; less x.sh`) nếu chưa chắc nguồn'] },
    { pre: ['sudo apt-mark hold nginx        # đóng băng phiên bản', 'apt-mark showhold', 'sudo apt-mark unhold nginx'], cap: 'Giữ gói không bị nâng cấp' },
    { note: '`hold` hữu ích cho gói mà bản mới có thể làm hỏng ứng dụng (PostgreSQL, Node major). Đừng quên bỏ hold khi cần vá bảo mật.', kind: 'tip' },
    'Nếu `apt` báo `Could not get lock /var/lib/dpkg/lock-frontend ... held by process N (unattended-upgr)`, đó là cập nhật bảo mật tự động của Ubuntu đang chạy. **Chờ nó xong** (vài phút), đừng xoá file khoá.'
  ] },
  { tag: 'Khái niệm', title: 'Người dùng và nhóm', body: [
    'Mỗi người (hoặc dịch vụ) là một **user** có UID; user thuộc một hoặc nhiều **nhóm**. Quyền file chia ba lớp: chủ, nhóm, người khác.',
    { pre: ['sudo groupadd devs                       # tạo nhóm', 'sudo useradd -m -s /bin/bash -G devs alice  # tạo user, thư mục home, shell, nhóm phụ', 'sudo usermod -aG devs bob                # THÊM bob vào nhóm (nhớ -a)', 'id alice                                 # uid, gid, các nhóm', 'getent group devs                        # ai trong nhóm devs', 'sudo passwd alice                        # đặt mật khẩu', 'sudo userdel -r alice                    # xoá user và thư mục home'], cap: 'Quản lý user, nhóm' },
    { note: '`usermod -G devs bob` (thiếu `-a`) **thay thế** toàn bộ nhóm phụ của bob bằng `devs`, làm bob mất quyền sudo nếu đang ở nhóm `sudo`. Luôn dùng `-aG`.', kind: 'warn' },
    { tbl: [['Tệp', 'Nội dung'], ['`/etc/passwd`', 'Danh sách user: tên, UID, GID, home, shell (không chứa mật khẩu)'], ['`/etc/group`', 'Danh sách nhóm và thành viên'], ['`/etc/shadow`', 'Mật khẩu đã băm, chỉ root đọc được']] }
  ] },
  { tag: 'Cú pháp', title: 'Thư mục dùng chung cho nhóm: chgrp và setgid', body: [
    'Mục tiêu: mọi thành viên nhóm `devs` đọc, ghi file trong `/srv/shared`, và file mới luôn thuộc nhóm `devs`.',
    { pre: ['sudo mkdir /srv/shared', 'sudo chgrp devs /srv/shared        # nhóm sở hữu thư mục', 'sudo chmod 2775 /srv/shared        # 2 = setgid, 775 = rwxrwxr-x', 'ls -ld /srv/shared               # drwxrwsr-x ... root devs'], cap: 'Thư mục chung' },
    { tbl: [['Phần', 'Ý nghĩa'], ['`s` ở vị trí thực thi của nhóm (`drwxrwsr-x`)', '**setgid**: file/thư mục mới tạo bên trong kế thừa nhóm `devs` thay vì nhóm chính của người tạo'], ['`775`', 'chủ và nhóm đọc, ghi, vào; người khác chỉ đọc, vào'], ['`chmod 770`', 'chặt hơn: người ngoài nhóm không vào được']] },
    { note: '**Cạm bẫy:** sau `usermod -aG devs haidangphan`, phiên SSH hiện tại **chưa** nhận nhóm mới. Phải đăng xuất rồi đăng nhập lại (hoặc dùng `newgrp devs`, hoặc `sudo -u user`). Dấu hiệu: `getent group devs` có tên bạn nhưng `id` chưa liệt kê `devs`.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'Dung lượng đĩa: df, du, inode', body: [
    { pre: ['df -h                      # dung lượng theo từng phân vùng', 'df -i                      # số inode đã dùng', 'du -sh /var/log            # tổng một thư mục', 'sudo du -h -d1 /var | sort -h   # thư mục con nặng nhất (nếu có sort -h)', 'lsblk                      # ổ đĩa và phân vùng', 'sudo apt install -y ncdu   # công cụ duyệt dung lượng tương tác'], cap: 'Ai đang ăn đĩa?' },
    { tbl: [['Cột `df -h`', 'Ý nghĩa'], ['`Size`', 'Tổng dung lượng'], ['`Used`', 'Đã dùng'], ['`Avail`', 'Còn trống'], ['`Use%`', 'Tỉ lệ; trên 90% là cảnh báo'], ['`Mounted on`', 'Điểm gắn']] },
    { note: '**Inode** là "thẻ đăng ký" của mỗi file. Hệ thống file có hữu hạn inode. Hàng triệu file nhỏ (session, cache) có thể làm `df -i` đạt 100% trong khi `df -h` vẫn còn nhiều chỗ. Triệu chứng: `No space left on device` dù đĩa trống.', kind: 'warn' },
    'Thủ phạm hay gặp: thư mục log chưa xoay vòng, `docker` image cũ, `/var/lib/php/sessions`, `node_modules` bị nhân bản, cache `apt` (`sudo apt clean`).'
  ] },
  { tag: 'Cú pháp', title: 'Gắn ổ đĩa và /etc/fstab', body: [
    'Ổ mới (ví dụ `/dev/vdb1`) phải **gắn (mount)** vào một thư mục mới dùng được. Gắn bằng tay sẽ mất khi reboot, nên khai báo trong `/etc/fstab`.',
    { pre: ['lsblk                                   # thấy vdb1 chưa gắn', 'sudo blkid /dev/vdb1                    # lấy UUID', 'sudo mount /dev/vdb1 /mnt/data', 'df -h /mnt/data', 'echo "UUID=... /mnt/data ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab', 'sudo mount -a                          # thử đọc lại fstab TRƯỚC khi reboot'], cap: 'Gắn và ghi nhớ' },
    { tbl: [['Cột fstab', 'Ý nghĩa'], ['1', 'Thiết bị (nên dùng `UUID=`, vì tên `/dev/vdb` có thể đổi)'], ['2', 'Điểm gắn'], ['3', 'Loại hệ thống file (`ext4`, `xfs`, `swap`)'], ['4', 'Tuỳ chọn; `nofail` để máy vẫn boot nếu ổ vắng mặt'], ['5, 6', 'dump (0) và thứ tự fsck (0, 1, 2)']] },
    { note: 'Một dòng fstab sai (không có `nofail`) có thể làm VPS **không khởi động được**. Luôn chạy `sudo mount -a` sau khi sửa: lỗi hiện ngay chứ không đợi reboot.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'Swap: bộ nhớ dự phòng khi hết RAM', body: [
    'VPS nhỏ (1-2 GB RAM) dễ bị kernel **OOM killer** giết tiến trình khi build hoặc khi ứng dụng phình bộ nhớ. **Swap** là vùng đĩa dùng thay RAM khi cạn, chậm hơn nhưng giúp qua cơn tải đột biến.',
    { pre: ['free -h                                   # RAM, swap', 'sudo fallocate -l 1G /swapfile            # file 1 GB', 'sudo chmod 600 /swapfile                   # swap chỉ root đọc', 'sudo mkswap /swapfile', 'sudo swapon /swapfile', 'swapon --show', "echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab   # giữ sau reboot", 'sudo sysctl vm.swappiness=10                # ít dùng swap hơn (mặc định 60)', "echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf   # giữ sau reboot"], cap: 'Thêm 1 GB swap' },
    { ul: ['Hai bước hay bị quên: `chmod 600` (không có thì cảnh báo insecure permissions) và dòng trong `/etc/fstab` (không có thì reboot xong swap mất)', 'Swap không thay RAM: nếu `free -h` luôn dùng nhiều swap, hãy tăng RAM hoặc giảm tải', '`sudo dmesg | grep -i "killed process"` cho biết tiến trình nào bị OOM giết'] }
  ] },
  { tag: 'Cú pháp', title: 'Chẩn đoán mạng từ trong ra ngoài', body: [
    'Khi "không vào được" hãy kiểm tra theo tầng, từ gần ra xa:',
    { tbl: [['Tầng', 'Câu hỏi', 'Lệnh'], ['Giao diện', 'Máy có IP không?', '`ip -br a`'], ['Đường đi', 'Có gateway mặc định không?', '`ip route`'], ['Cổng nội bộ', 'Ứng dụng có đang lắng nghe không?', '`sudo ss -tlnp`'], ['Ra ngoài bằng IP', 'Mạng thông không?', '`ping -c 2 8.8.8.8`'], ['Phân giải tên', 'DNS trả lời không?', '`dig +short example.com`'], ['Ứng dụng', 'HTTP trả gì?', '`curl -I https://example.com`, `curl -v`']] },
    { pre: ['ip -br a', 'ip route                     # dòng "default via ..." là gateway', 'ping -c 2 example.com', 'traceroute example.com       # (sudo apt install traceroute) đường đi từng chặng', 'mtr -rc 5 example.com        # báo cáo mất gói theo chặng (cần gói mtr-tiny)', 'curl -sv https://example.com -o /dev/null   # TLS, header, mã trạng thái'], cap: 'Bộ lệnh mạng' },
    { note: '`ping` không thông chưa chắc máy chết: nhiều máy chủ chặn ICMP. Thử `curl` tới cổng thực (80/443) trước khi kết luận.', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: 'DNS trên máy: /etc/hosts và resolv.conf', body: [
    { tbl: [['Tệp', 'Vai trò'], ['`/etc/hosts`', 'Bảng tên→IP cục bộ, được tra **trước** DNS. Hợp để đặt bí danh: `10.0.0.20 backup`'], ['`/etc/resolv.conf`', 'Danh sách máy chủ DNS (`nameserver 1.1.1.1`)'], ['`dig +short tên`', 'Truy vấn DNS trực tiếp; `dig @1.1.1.1 tên` hỏi một máy chủ cụ thể'], ['`nslookup tên`', 'Tương tự dig, định dạng cũ']] },
    { pre: ['cat /etc/resolv.conf', 'ping -c 1 8.8.8.8        # thông', 'ping -c 1 google.com     # Temporary failure in name resolution', 'dig @1.1.1.1 +short google.com   # DNS ngoài trả lời được => máy chủ DNS cục bộ hỏng'], cap: 'Cô lập lỗi DNS' },
    { ul: ['`Temporary failure in name resolution` = không liên lạc được máy chủ DNS nào (sai/không có `nameserver`)', '`Name or service not known` = DNS trả lời nhưng tên không tồn tại (sai chính tả, chưa trỏ bản ghi)', 'Nếu IP ping được mà tên không, vấn đề **luôn** nằm ở DNS, không phải đường truyền'] }
  ] },
  { tag: 'Cú pháp', title: 'Nén và đóng gói: tar, gzip', body: [
    { pre: ['tar czf backup.tgz /srv/tutor --exclude=node_modules   # c=tạo, z=gzip, f=tên file', 'tar tzf backup.tgz | head            # t=liệt kê, không giải nén', 'mkdir restore && tar xzf backup.tgz -C restore   # x=giải nén, -C=vào thư mục', 'gzip -k big.log                     # nén, -k giữ bản gốc', 'gunzip big.log.gz'], cap: 'tar thông dụng' },
    { ul: ['Thứ tự cờ `czf`: tên file đứng ngay sau `f`', 'Luôn `tar tzf` kiểm tra trước khi giải nén vào thư mục thật; archive có đường dẫn tuyệt đối có thể ghi đè file', '`--exclude=node_modules` giảm kích thước rất nhiều'] }
  ] },
  { tag: 'Cú pháp', title: 'Chuyển file giữa máy: scp, rsync, sftp', body: [
    { pre: ['scp backup.tgz backup@backup:/backups/       # chép 1 file qua SSH', 'scp -r proj backup@backup:/backups/        # cả thư mục', 'scp backup@backup:/backups/a.txt ./        # kéo về', 'rsync -avz proj/ backup@backup:/backups/proj/   # chỉ chép phần khác biệt', "printf 'put a.txt\\nls\\nbye\\n' | sftp -b - backup@backup   # sftp theo lô"], cap: 'Ba cách chuyển file' },
    { tbl: [['Cờ rsync', 'Ý nghĩa'], ['`-a`', 'archive: giữ quyền, thời gian, đệ quy'], ['`-v`', 'in chi tiết'], ['`-z`', 'nén khi truyền'], ['`-n` (`--dry-run`)', 'chạy thử, không thay đổi gì'], ['`--delete`', 'XOÁ ở đích những file không có ở nguồn'], ['`--exclude=x`', 'bỏ qua mẫu x']] },
    { note: 'Dấu `/` cuối nguồn quyết định kết quả: `rsync -a proj/ dst/` chép **nội dung** proj vào dst; `rsync -a proj dst/` tạo `dst/proj`. Nhầm lẫn này cộng với `--delete` có thể xoá sạch thư mục đích. **Luôn chạy `-n` trước.**', kind: 'warn' }
  ] },
  { tag: 'Bảng tra', title: 'Bảng triệu chứng, nguyên nhân và lệnh kiểm tra', body: [
    { tbl: [['Triệu chứng', 'Nguyên nhân', 'Lệnh kiểm tra', 'Cách sửa'], ['`No space left on device`, `df -h` còn trống', 'Hết inode', '`df -i`, `sudo du --inodes -d1 /var`', 'Xoá thư mục chứa hàng triệu file nhỏ'], ['`No space left on device`, `df -h` 100%', 'Đầy đĩa', '`df -h`, `sudo du -h -d1 /var`', 'Xoá log, `apt clean`, mở rộng đĩa'], ['`Could not get lock /var/lib/dpkg/lock-frontend`', 'Tiến trình khác (unattended-upgr) đang dùng apt', '`ps aux | grep -E "apt|unattended"`', 'Chờ xong; không xoá khoá'], ['`Unable to locate package`', 'Chưa `apt update` hoặc thiếu kho', '`apt-cache policy gói`', '`sudo apt update`; thêm kho'], ['Reboot xong mất swap', 'Không có dòng swap trong fstab', '`swapon --show`, `grep swap /etc/fstab`', 'Thêm dòng, `swapon -a`'], ['`Permission denied` dù đã vào nhóm', 'Phiên cũ chưa nhận nhóm mới', '`id` so với `getent group`', 'Đăng nhập lại / `newgrp`'], ['`Temporary failure in name resolution`', 'DNS sai', '`cat /etc/resolv.conf`, `dig @1.1.1.1`', 'Sửa nameserver'], ['rsync xoá mất file ở đích', '`--delete` + nguồn sai', '`rsync -avn --delete` trước', 'Khôi phục từ bản sao lưu; luôn dry-run']] }
  ] },
  { tag: 'Quy trình', title: 'Checklist cuối chương', body: [
    { ul: ['**1.** `sudo apt update` trước mọi `install`; biết `remove` khác `purge`', '**2.** Biết nguồn của từng kho phụ; phiên bản quan trọng được `apt-mark hold`', '**3.** Thành viên được thêm bằng `usermod -aG` (có `-a`)', '**4.** Thư mục chung có nhóm đúng và bit setgid (`2775`)', '**5.** `df -h` **và** `df -i` đều dưới 80%', '**6.** Mọi ổ gắn thêm có dòng fstab dùng UUID với `nofail`; đã `mount -a`', '**7.** Có swap và dòng swap trong fstab; `swappiness` hợp lý', '**8.** Chẩn đoán mạng theo tầng: IP, route, cổng, ping IP, DNS, HTTP', '**9.** Sao lưu bằng `tar` hoặc `rsync` được kiểm tra bằng `-n` / `tar t` trước', '**10.** Không bao giờ chạy `rsync --delete` lần đầu mà không có `-n`'] }
  ] }
];

D.quiz = C.QZ(2, [
  ['Bạn chạy `sudo apt install jq` và nhận `Unable to locate package jq`. Bước đầu tiên nên làm?', '`sudo apt update` để tải lại danh sách gói', ['`sudo apt upgrade -y` để nâng cấp toàn bộ', '`sudo apt autoremove` để dọn gói thừa', '`sudo reboot` rồi thử lại'], '`apt update` làm mới danh sách gói; `upgrade` mới là nâng cấp phần mềm đã cài.'],
  ['Khác biệt giữa `apt remove nginx` và `apt purge nginx`?', '`purge` xoá luôn file cấu hình trong `/etc`; `remove` giữ lại cấu hình', ['`remove` xoá cả dữ liệu website, `purge` thì không', '`purge` chỉ dùng được với gói từ PPA', 'Không khác gì nhau'], 'Giữ cấu hình hữu ích khi cài lại; `purge` dùng khi muốn sạch hẳn.'],
  ['Dòng lệnh nào ngăn `apt upgrade` đụng tới nginx?', '`sudo apt-mark hold nginx`', ['`sudo apt freeze nginx`', '`sudo systemctl mask nginx`', '`sudo apt pin nginx`'], '`apt-mark hold` đóng băng phiên bản; `apt-mark showhold` liệt kê, `unhold` bỏ.'],
  ['`apt` báo "Could not get lock ... held by process 1843 (unattended-upgr)". Cách xử lý đúng?', 'Chờ tiến trình cập nhật tự động chạy xong rồi chạy lại', ['Xoá file `/var/lib/dpkg/lock-frontend` rồi chạy tiếp', 'Chạy `kill -9 1843` ngay', 'Cài lại hệ điều hành'], 'Xoá khoá hoặc kill giữa chừng có thể làm dpkg hỏng; chỉ cần chờ.'],
  ['Lệnh nào thêm user `bob` vào nhóm `devs` mà KHÔNG làm mất các nhóm khác của bob?', '`sudo usermod -aG devs bob`', ['`sudo usermod -G devs bob`', '`sudo groupmod devs bob`', '`sudo useradd -G devs bob`'], 'Thiếu `-a` thì `-G` thay thế toàn bộ danh sách nhóm phụ.'],
  ['`ls -ld /srv/shared` cho `drwxrwsr-x root devs`. Chữ `s` có tác dụng gì?', 'File mới tạo trong thư mục kế thừa nhóm `devs`', ['File mới chỉ chủ sở hữu đọc được', 'Thư mục bị khoá, không ai xoá được', 'Chỉ root được tạo file mới trong đó'], 'Đó là bit setgid (mode 2775). Nhờ nó cả nhóm cùng sở hữu mọi file mới.'],
  ['Bạn vừa `sudo usermod -aG devs haidangphan`, nhưng `touch /srv/shared/x` vẫn bị từ chối. Vì sao?', 'Phiên đăng nhập hiện tại chưa nhận nhóm mới; cần đăng nhập lại', ['Cần chạy thêm `chmod 777 /srv/shared`', 'Nhóm devs bị khoá', 'Lệnh usermod chưa được hỗ trợ trên Ubuntu'], 'Danh sách nhóm được đọc lúc đăng nhập. `exit` rồi SSH lại, hoặc `newgrp devs`.'],
  ['`df -h` báo `/` còn 30% trống nhưng `touch file` báo "No space left on device". Chẩn đoán?', 'Hết inode; kiểm tra bằng `df -i`', ['Đĩa bị hỏng vật lý', 'Cần reboot máy chủ', 'Quyền ghi bị chặn'], 'Hàng triệu file nhỏ làm cạn inode trước khi cạn dung lượng.'],
  ['Điểm khác biệt chính giữa `du -sh /var/log` và `df -h`?', '`du` tính dung lượng của một thư mục; `df` báo tổng dung lượng theo phân vùng', ['`du` báo phân vùng, `df` báo thư mục', 'Hai lệnh giống nhau', '`du` chỉ hiện ở root'], '`df` trả lời "đĩa còn bao nhiêu"; `du` trả lời "cái gì đang chiếm chỗ".'],
  ['Vì sao dùng `UUID=` thay vì `/dev/vdb1` trong fstab?', 'Tên thiết bị có thể đổi khi thêm bớt ổ; UUID gắn với hệ thống file', ['UUID chạy nhanh hơn', 'Linux không chấp nhận tên /dev trong fstab', 'UUID tự mã hoá ổ đĩa'], '`blkid` cho biết UUID. Thêm `nofail` để máy vẫn boot nếu ổ vắng mặt.'],
  ['Bạn tạo swap bằng fallocate, chmod 600, mkswap, swapon. Reboot xong `swapon --show` trống. Thiếu gì?', 'Dòng `/swapfile none swap sw 0 0` trong `/etc/fstab`', ['Phải chạy `swapon` hai lần', 'Swap file phải đặt ở `/boot`', 'Cần `swappiness=100`'], 'Gắn bằng tay không tồn tại sau reboot; fstab khai báo lâu dài.'],
  ['`ping 8.8.8.8` thông nhưng `ping google.com` báo "Temporary failure in name resolution". Lỗi ở đâu?', 'Máy chủ DNS trong `/etc/resolv.conf` không trả lời', ['Cáp mạng hỏng', 'Cổng 443 bị chặn', 'Đồng hồ máy sai'], 'Đường truyền ổn (ping IP được) nên vấn đề nằm ở phân giải tên.'],
  ['`rsync -a proj dst/` khác `rsync -a proj/ dst/` thế nào?', 'Không có `/` cuối: tạo `dst/proj`; có `/` cuối: chép nội dung proj trực tiếp vào dst', ['Giống hệt nhau', 'Có `/` cuối thì rsync chạy ở chế độ dry-run', 'Không có `/` cuối thì bị lỗi cú pháp'], 'Dấu `/` cuối đường dẫn nguồn quyết định có tạo thư mục con hay không.'],
  ['Trước khi chạy `rsync -a --delete /srv/site/ backup@host:/backups/site/` lần đầu, việc cần làm là?', 'Thêm `-n` (dry-run) để xem danh sách file sẽ bị xoá', ['Đổi `--delete` thành `--force`', 'Chạy bằng `sudo` để chắc chắn đủ quyền', 'Xoá thư mục đích trước'], '`--delete` xoá ở đích mọi thứ không có ở nguồn. Nguồn sai là mất dữ liệu; dry-run phát hiện ngay.']
]);

D.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { base(s, { vdb: true }); },
  items: [
    { text: 'Thử `apt update` không sudo: phải bị từ chối.', hint: 'apt update', check: FAIL(/^apt update$/) },
    { text: 'Làm mới danh sách gói.', hint: 'sudo apt update', check: OK(/^sudo apt update$/) },
    { text: 'Gói nào có bản mới?', hint: 'apt list --upgradable', check: OK(/^apt list --upgradable/) },
    { text: 'Xem phiên bản đã cài và bản ứng viên của openssl.', hint: 'apt-cache policy openssl', check: OK(/^apt-cache policy openssl/) },
    { text: 'Nâng cấp mọi gói.', hint: 'sudo apt upgrade -y', check: OK(/^sudo apt upgrade -y/) },
    { text: 'Xem Node.js trong kho Ubuntu: bản ứng viên cũ hoặc chưa có.', hint: 'apt-cache policy nodejs', check: OK(/^apt-cache policy nodejs/) },
    { text: 'Thêm kho NodeSource cho Node 22.', hint: 'curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -', check: function (s) { return !!s.fs.get('/etc/apt/sources.list.d/nodesource.list'); } },
    { text: 'Đọc kho vừa thêm.', hint: 'cat /etc/apt/sources.list.d/nodesource.list', check: OK(/^cat \/etc\/apt\/sources\.list\.d\/nodesource\.list/) },
    { text: 'Cập nhật danh sách để nhận kho mới.', hint: 'sudo apt update', check: function (s) { return s.hist.filter(function (h) { return h.code === 0 && /^sudo apt update$/.test(h.cmd); }).length >= 2; } },
    { text: 'Bản ứng viên của nodejs bây giờ là bản nào?', hint: 'apt-cache policy nodejs', check: function (s) { return s.hist.filter(function (h) { return h.code === 0 && /^apt-cache policy nodejs/.test(h.cmd); }).length >= 2; } },
    { text: 'Cài Node.js.', hint: 'sudo apt install -y nodejs', check: OK(/^sudo apt install -y nodejs/) },
    { text: 'Xác nhận phiên bản.', hint: 'node -v', check: OK(/^node -v/) },
    { text: 'Thử `jq` khi chưa cài: sẽ có gợi ý cài.', hint: 'jq --version', check: FAIL(/^jq --version/) },
    { text: 'Cài jq, ncdu.', hint: 'sudo apt install -y jq ncdu', check: OK(/^sudo apt install -y jq ncdu/) },
    { text: 'Giữ nginx ở phiên bản hiện tại.', hint: 'sudo apt-mark hold nginx', check: OK(/^sudo apt-mark hold nginx/) },
    { text: 'Xem gói đang bị giữ.', hint: 'apt-mark showhold', check: OK(/^apt-mark showhold/) },
    { text: 'Bỏ giữ nginx và xem nginx đã cài (dpkg).', hint: 'sudo apt-mark unhold nginx; dpkg -l nginx', check: OK(/^dpkg -l nginx/) },
    { text: 'Tạo nhóm `devs` và user `alice` (có home, bash) thuộc nhóm đó.', hint: 'sudo groupadd devs\nsudo useradd -m -s /bin/bash -G devs alice', check: function (s) { return /^devs:.*alice/m.test(ftxt(s, '/etc/group')); } },
    { text: 'Xem nhóm của alice và thành viên nhóm devs.', hint: 'id alice; getent group devs', check: OK(/^getent group devs/) },
    { text: 'Tạo thư mục chung `/srv/shared`, gán nhóm devs, bật setgid.', hint: 'sudo mkdir /srv/shared\nsudo chgrp devs /srv/shared\nsudo chmod 2775 /srv/shared', check: function (s) { var n = s.fs.get('/srv/shared'); return !!n && n.group === 'devs' && (n.mode & 1024) > 0; } },
    { text: 'Xác nhận chữ `s` trong quyền.', hint: 'ls -ld /srv/shared', check: OK(/^ls -ld \/srv\/shared/) },
    { text: 'alice tạo file trong thư mục chung.', hint: 'sudo -u alice touch /srv/shared/a.txt', check: function (s) { return !!s.fs.get('/srv/shared/a.txt'); } },
    { text: 'File của alice thuộc nhóm nào? (Nhờ setgid: devs).', hint: 'ls -l /srv/shared', check: OK(/^ls -l \/srv\/shared/) },
    { text: 'Thêm chính bạn vào nhóm devs.', hint: 'sudo usermod -aG devs haidangphan', check: function (s) { var u = (V.sec.S(s.W).users || {}).haidangphan; return !!u && u.groups.indexOf('devs') >= 0; } },
    { text: 'Thử ghi ngay: vẫn bị từ chối vì phiên cũ.', hint: 'touch /srv/shared/mine', check: FAIL(/^touch \/srv\/shared\/mine/) },
    { text: 'Đăng nhập lại để nhận nhóm.', hint: 'exit', check: OK(/^exit/) },
    { text: 'Ghi lại: lần này phải được.', hint: 'id\ntouch /srv/shared/mine', check: function (s) { return !!s.fs.get('/srv/shared/mine'); } },
    { text: 'Xem dung lượng các phân vùng.', hint: 'df -h', check: OK(/^df -h$/) },
    { text: 'Xem số inode đã dùng.', hint: 'df -i', check: OK(/^df -i$/) },
    { text: 'Xem dung lượng thư mục log.', hint: 'sudo du -sh /var/log', check: OK(/^sudo du -sh \/var\/log/) },
    { text: 'Xem ổ đĩa và phân vùng: `vdb1` chưa được gắn.', hint: 'lsblk', check: OK(/^lsblk/) },
    { text: 'Lấy UUID của vdb1.', hint: 'sudo blkid /dev/vdb1', check: OK(/^sudo blkid \/dev\/vdb1/) },
    { text: 'Gắn vdb1 vào /mnt/data.', hint: 'sudo mount /dev/vdb1 /mnt/data', check: OK(/^sudo mount \/dev\/vdb1 \/mnt\/data/) },
    { text: 'Khai báo vào fstab để gắn tự động, sau đó thử `mount -a`.', hint: "echo '/dev/vdb1 /mnt/data ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab\nsudo mount -a", check: function (s) { return /\/mnt\/data\s+ext4\s+\S*nofail/.test(ftxt(s, '/etc/fstab')) && s.hist.some(function (h) { return h.code === 0 && /^sudo mount -a/.test(h.cmd); }); } },
    { text: 'Xem RAM và swap hiện có.', hint: 'free -h', check: OK(/^free -h/) },
    { text: 'Tạo file swap 1 GB.', hint: 'sudo fallocate -l 1G /swapfile', check: function (s) { return !!s.fs.get('/swapfile'); } },
    { text: 'Đặt quyền 600 cho swap.', hint: 'sudo chmod 600 /swapfile', check: function (s) { var n = s.fs.get('/swapfile'); return !!n && (n.mode & 63) === 0; } },
    { text: 'Định dạng và bật swap.', hint: 'sudo mkswap /swapfile\nsudo swapon /swapfile', check: function (s) { return (s.W.lin.swaps || []).some(function (x) { return x.path === '/swapfile'; }); } },
    { text: 'Xem swap đang bật.', hint: 'swapon --show', check: OK(/^swapon --show/) },
    { text: 'Ghi swap vào fstab để sống qua reboot.', hint: "echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab", check: function (s) { return /^\/swapfile\s+none\s+swap/m.test(ftxt(s, '/etc/fstab')); } },
    { text: 'Hạ swappiness xuống 10 và lưu lâu dài.', hint: "sudo sysctl vm.swappiness=10\necho 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf", check: function (s) { return /vm\.swappiness\s*=\s*10/.test(ftxt(s, '/etc/sysctl.d/99-swap.conf')); } },
    { text: 'Xem địa chỉ IP dạng gọn.', hint: 'ip -br a', check: OK(/^ip -br a/) },
    { text: 'Xem bảng định tuyến và gateway mặc định.', hint: 'ip route', check: OK(/^ip route/) },
    { text: 'Ping tên miền.', hint: 'ping -c 2 example.com', check: OK(/^ping -c 2 example\.com/) },
    { text: 'Xem header HTTP của một site.', hint: 'curl -I example.com', check: OK(/^curl -I example\.com/) },
    { text: 'Đọc cấu hình DNS.', hint: 'cat /etc/resolv.conf', check: OK(/^cat \/etc\/resolv\.conf/) },
    { text: 'Cài công cụ chẩn đoán mạng.', hint: 'sudo apt install -y traceroute dnsutils mtr-tiny', check: OK(/^sudo apt install -y traceroute dnsutils mtr-tiny/) },
    { text: 'Hỏi DNS của Cloudflare trực tiếp.', hint: 'dig @1.1.1.1 +short example.com', check: OK(/^dig @1\.1\.1\.1/) },
    { text: 'Xem đường đi tới example.com.', hint: 'mtr -rc 3 example.com', check: OK(/^mtr -rc 3/) },
    { text: 'Đặt bí danh `backup` cho máy 10.0.0.20 trong /etc/hosts.', hint: "echo '10.0.0.20 backup' | sudo tee -a /etc/hosts", check: function (s) { return /^10\.0\.0\.20\s+backup/m.test(ftxt(s, '/etc/hosts')); } },
    { text: 'Tạo dữ liệu thử rồi nén thành tgz, loại trừ *.log.', hint: 'mkdir -p proj/src && echo hello > proj/src/a.txt && echo big > proj/b.log\ntar czf p.tgz proj --exclude=*.log', check: function (s) { return !!s.fs.get(s.home + '/p.tgz'); } },
    { text: 'Liệt kê nội dung archive để kiểm tra.', hint: 'tar tzf p.tgz', check: OK(/^tar tzf p\.tgz/) },
    { text: 'Chép file lên máy sao lưu bằng scp.', hint: 'scp p.tgz backup@backup:/backups/', check: OK(/^scp p\.tgz backup@backup:\/backups\//) },
    { text: 'Chạy thử (-n) rsync thư mục.', hint: 'rsync -avzn proj/ backup@backup:/backups/proj/', check: OK(/^rsync -avzn proj\//) },
    { text: 'Chạy thật.', hint: 'rsync -avz proj/ backup@backup:/backups/proj/', check: OK(/^rsync -avz proj\//) },
    { text: 'Xem kết quả trên máy từ xa.', hint: 'ssh backup@backup ls /backups/proj', check: OK(/^ssh backup@backup ls \/backups\/proj/) }
  ]
};

D.debugs = [
  {
    id: 'c1c1', title: 'No space left on device, nhưng df -h còn trống',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ touch /srv/tutor/dist/x', 'touch: cannot touch \'/srv/tutor/dist/x\': No space left on device', '', '$ df -h /', 'Filesystem      Size  Used Avail Use% Mounted on', '/dev/vda1        40G   12G   28G  30% /'),
    story: 'Sau vài tuần chạy, deploy báo không ghi được file. Đĩa còn 28 GB trống. Một đồng nghiệp bảo mở rộng đĩa, nhưng bạn nghi ngờ.',
    goal: 'Có thể tạo file mới trên `/` trở lại (hết "No space left on device").',
    hints: ['Dung lượng (`df -h`) ổn thì còn tài nguyên khác cũng có thể cạn. Thử `df -i`.', 'Inode dùng 100%. Tìm thư mục chứa hàng triệu file: `sudo du --inodes -d2 /var | sort -n | tail` hoặc xem `ls /var/lib`.', 'Thư mục sessions cũ: `sudo find /var/lib/app/sessions -type f -delete`, rồi kiểm tra lại `df -i`.'],
    fix: ['df -h /', 'df -i /', 'sudo du --inodes -d2 /var/lib', 'sudo find /var/lib/app/sessions -type f -delete', 'df -i /', 'touch /srv/tutor/dist/x'],
    cause: 'Mỗi file chiếm một inode; ext4 có số inode cố định khi tạo. Hàng triệu file session nhỏ làm hết inode dù tổng dung lượng rất thấp. Giải pháp: xoá và đặt cron dọn session cũ.',
    setup: function (s) { base(s, { setup2: function (s2) { s2.fs.mkdirp('/var/lib/app/sessions', 'root', 493); s2.fs.get('/var/lib/app/sessions').virt = 2500000; } }); },
    check: function (s) { var n = s.fs.get('/var/lib/app/sessions'); return !n || !n.virt; }
  },
  {
    id: 'c1c2', title: 'apt: Could not get lock',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ sudo apt install -y jq', 'E: Could not get lock /var/lib/dpkg/lock-frontend. It is held by process 1843 (unattended-upgr)', 'E: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), is another process using it?'),
    story: 'Bạn vừa tạo VPS mới và muốn cài jq, nhưng apt không cho cài.',
    goal: 'Cài được gói `jq` an toàn, không làm hỏng dpkg.',
    hints: ['Đọc thông báo: tiến trình 1843 `unattended-upgr` đang giữ khoá. Xem nó bằng `ps -p 1843 -o pid,user,cmd`.', 'Đó là cập nhật bảo mật tự động của Ubuntu. Xoá file khoá hoặc `kill -9` có thể làm gói hỏng giữa chừng.', 'Chờ nó kết thúc (ở đây `sleep 200` để đồng hồ giả lập chạy), rồi thử lại `sudo apt install -y jq`.'],
    fix: ['ps -p 1843 -o pid,user,cmd', 'sleep 200', 'ps -p 1843', 'sudo apt install -y jq', 'jq --version'],
    cause: 'Ngay sau khi tạo VPS, `unattended-upgrades` thường chạy vài phút. Nó giữ khoá dpkg để các gói không bị ghi chồng. Chờ xong là cách duy nhất an toàn.',
    setup: function (s) { base(s, { upg: 180 }); },
    check: function (s) { return !!(s.W.lin2.pkgs && s.W.lin2.pkgs.jq); }
  },
  {
    id: 'c1c3', title: 'Reboot xong swap biến mất',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ free -h', '               total        used        free', 'Mem:           1.9Gi       1.4Gi       100Mi', 'Swap:             0B          0B          0B', '', '$ ls -lh /swapfile', '-rw------- 1 root root 1.0G Oct 26 09:00 /swapfile'),
    story: 'Tuần trước bạn tạo `/swapfile` 1 GB và bật. Sau lần bảo trì VPS vừa rồi, build lại bị OOM killer giết.',
    goal: 'Swap đang bật và tự bật lại sau mỗi lần reboot.',
    hints: ['File `/swapfile` vẫn còn, nhưng `swapon --show` trống: swap chưa được bật.', 'Bật thủ công `sudo swapon /swapfile` chỉ có tác dụng đến lần reboot sau. Xem `grep swap /etc/fstab`.', 'Thêm dòng `/swapfile none swap sw 0 0` vào `/etc/fstab` (tee -a) rồi chạy `sudo swapon -a`.'],
    fix: ['swapon --show', 'grep swap /etc/fstab', "echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab", 'sudo swapon -a', 'swapon --show'],
    cause: 'Swap bật bằng `swapon` chỉ sống đến lần khởi động kế. Muốn bền phải có dòng swap trong `/etc/fstab`; `swapon -a` bật mọi swap khai báo trong đó.',
    setup: function (s) {
      base(s, { setup2: function (s2) {
        s2.fs.put('/swapfile', '', { owner: 'root', mode: 384 }); var n = s2.fs.get('/swapfile'); n.size = 1073741824; n.swap = { mb: 1024, uuid: '5c7e1a90-2b34-4d8f-a6c1-001024ab12' };
        s2.W.lin.swaps.push({ path: '/swapfile', mb: 1024, used: 0 }); LIN.reboot(s2, quiet);
      } });
    },
    check: function (s) { return (s.W.lin.swaps || []).some(function (x) { return x.path === '/swapfile'; }) && /^\/swapfile\s+none\s+swap/m.test(ftxt(s, '/etc/fstab')); }
  },
  {
    id: 'c1c4', title: 'rsync --delete: đồng bộ mà không xoá file của người khác',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ rsync -avzn --delete ~/site/ backup@backup:/backups/site/', 'sending incremental file list', 'deleting customers.db', 'new.html', '', 'sent 131 bytes  received 28 bytes (DRY RUN)'),
    story: 'Bạn đồng bộ thư mục site lên máy sao lưu. Dry-run cho thấy `deleting customers.db`: file đó do hệ thống khác ghi trực tiếp lên máy sao lưu, không có trong thư mục `~/site` của bạn. Chạy thật với `--delete` sẽ xoá nó.',
    goal: 'Đẩy `new.html` lên máy sao lưu và **giữ nguyên** `customers.db` ở đó.',
    hints: ['`--delete` xoá ở đích mọi thứ không có ở nguồn. Bạn có thực sự cần cờ đó không?', 'Không dùng `--delete` thì rsync chỉ thêm và cập nhật. Chạy dry-run `-n` để xác nhận.', 'Chạy `rsync -avz ~/site/ backup@backup:/backups/site/` rồi `ssh backup@backup ls /backups/site`.'],
    fix: ['rsync -avzn ~/site/ backup@backup:/backups/site/', 'rsync -avz ~/site/ backup@backup:/backups/site/', 'ssh backup@backup ls /backups/site'],
    cause: '`--delete` biến đích thành bản sao chính xác của nguồn, nên xoá mọi file lạ. Chỉ dùng khi đích được phép là gương của nguồn, và luôn chạy `-n` trước.',
    setup: function (s) {
      base(s, { setup2: function (s2) {
        addBackupHost(s2); s2.fs.mkdirp(s2.home + '/site', s2.user, 493); s2.fs.put(s2.home + '/site/index.html', '<h1>site</h1>\n', { owner: s2.user, mode: 420 }); s2.fs.put(s2.home + '/site/new.html', '<h1>new</h1>\n', { owner: s2.user, mode: 420 });
        s2.fs.mkdirp('/__r/backup/backups/site', 'backup', 493); s2.fs.put('/__r/backup/backups/site/index.html', '<h1>site</h1>\n', { owner: 'backup', mode: 420 }); s2.fs.put('/__r/backup/backups/site/customers.db', 'data\n', { owner: 'backup', mode: 420 });
      } });
    },
    check: function (s) { return !!s.fs.get('/__r/backup/backups/site/new.html') && !!s.fs.get('/__r/backup/backups/site/customers.db'); }
  },
  {
    id: 'c1c5', title: 'Temporary failure in name resolution',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ curl -I https://example.com', 'curl: (6) Could not resolve host: example.com', '', '$ ping -c 1 8.8.8.8', '64 bytes from 8.8.8.8: icmp_seq=1 ttl=117 time=12.1 ms', '', '$ cat /etc/resolv.conf', 'nameserver 10.255.255.254'),
    story: 'Ứng dụng đột nhiên không gọi được API ngoài. Ping IP vẫn thông. Một công cụ cấu hình mạng cũ vừa ghi đè `resolv.conf`.',
    goal: 'Phân giải tên miền hoạt động trở lại (`dig`/`curl` tới tên miền chạy được).',
    hints: ['Ping IP thông nên mạng ổn; lỗi ở phân giải tên. Xem `cat /etc/resolv.conf`.', 'Máy chủ DNS 10.255.255.254 không tồn tại. Chứng minh bằng `dig @1.1.1.1 +short example.com`: DNS ngoài trả lời được.', 'Ghi lại nameserver hợp lệ: `echo "nameserver 1.1.1.1" | sudo tee /etc/resolv.conf`, rồi `curl -I example.com`.'],
    fix: ['cat /etc/resolv.conf', 'dig @1.1.1.1 +short example.com', 'echo "nameserver 1.1.1.1" | sudo tee /etc/resolv.conf', 'curl -I example.com'],
    cause: '`/etc/resolv.conf` trỏ tới máy chủ DNS không phản hồi, nên mọi tên miền thất bại dù đường truyền tốt. Trên Ubuntu thật nó thường là liên kết do systemd-resolved quản lý; sửa trực tiếp chỉ là tạm thời nếu dịch vụ ghi đè lại.',
    setup: function (s) { base(s, { setup2: function (s2) { s2.fs.put('/etc/resolv.conf', 'nameserver 10.255.255.254\n', { owner: 'root', mode: 420 }); } }); },
    check: function (s) { var t = ftxt(s, '/etc/resolv.conf'); return /nameserver\s+(1\.1\.1\.1|8\.8\.8\.8|9\.9\.9\.9|127\.0\.0\.53)/.test(t) && !/10\.255\.255\.254/.test(t); }
  },
  {
    id: 'c1c6', title: 'Đã vào nhóm deployers mà vẫn Permission denied', hard: true,
    host: 'vps', user: 'haidangphan',
    symptom: L('$ touch /srv/deploy/release.txt', 'touch: cannot touch \'/srv/deploy/release.txt\': Permission denied', '', '$ getent group deployers', 'deployers:x:1100:haidangphan', '', '$ ls -ld /srv/deploy', 'drwxrwsr-x 2 root deployers 4096 Oct 27 10:00 /srv/deploy'),
    story: 'Quản trị viên đã thêm tên bạn vào nhóm `deployers`, thư mục quyền đúng, nhưng bạn vẫn không ghi được.',
    goal: 'Tạo được `/srv/deploy/release.txt` với tư cách chính bạn, không dùng sudo, không đổi quyền thư mục.',
    hints: ['So sánh `getent group deployers` (cơ sở dữ liệu) với `id` (phiên của bạn).', '`id` chưa liệt kê `deployers`: phiên SSH đang chạy mang danh sách nhóm cũ.', 'Đăng nhập lại (`exit` rồi vào lại) để nhận nhóm; sau đó `id` và `touch`.'],
    fix: ['id', 'getent group deployers', 'exit', 'id', 'touch /srv/deploy/release.txt'],
    cause: 'Danh sách nhóm của tiến trình được chốt lúc đăng nhập. Thêm nhóm bằng `usermod -aG` không ảnh hưởng phiên đang mở. Đăng nhập lại (hoặc `newgrp deployers`) là đủ; không cần `chmod 777`.',
    setup: function (s) { base(s, { setup2: function (s2) { L2.addGroup(s2, 'deployers', ['haidangphan']); s2.fs.mkdirp('/srv/deploy', 'root', 1533); var n = s2.fs.get('/srv/deploy'); n.group = 'deployers'; n.mode = 1533; } }); },
    check: function (s) { var n = s.fs.get('/srv/deploy/release.txt'); return !!n && n.owner === s.user; }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
