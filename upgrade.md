音频文件导入功能：
更健壮的推荐做法
在生产级的应用中，通常会采用更健acts的做法来保证路径的稳定和可移植：

定义应用的“数据主目录”: 利用 Tauri 的 API 获取一个专属于本应用的、稳定的数据存储目录。例如 tauri::api::path::app_data_dir()。这个目录在不同电脑、不同操作系统上路径不同，但对于应用本身来说，总能找到它。

Windows: C:\Users\YourName\AppData\Roaming\your-app-name

macOS: /Users/YourName/Library/Application Support/your-app-name

导入时复制文件: 在执行 import_task_package 时，不是记录原始路径，而是将任务包里的所有音频文件 复制 到上面获取到的“数据主目录”下的一个新子文件夹里（例如 .../your-app-name/imported_audio/task_123/）。

存储相对路径: 在数据库中，只存储相对于“数据主目录”的 相对路径。例如，只存 imported_audio/task_123/wakeword/audio001.wav。

运行时动态拼接: 当应用需要播放这个音频时，它会：
a.  动态获取“数据主目录”的绝对路径。
b.  从数据库读取相对路径。
c.  将两者拼接起来，得到当前环境下正确的完整路径。