using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace HrWhatsAppLauncher
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }

    public class MainForm : Form
    {
        private Panel statusPanel;
        private Label statusLabel;
        private TextBox netText;
        private Button btnCopy;
        private Button btnStart;
        private Button btnFirewall;
        private Button btnStop;
        private Button btnClose;
        private System.Windows.Forms.Timer timer;
        private List<string> ipList = new List<string>();

        public MainForm()
        {
            InitializeComponent();
            LoadNetworkIps();
            CheckHealth();

            // فحص أولي: إذا لم يكن يعمل، تشغيله تلقائياً
            ThreadPool.QueueUserWorkItem(state =>
            {
                if (!IsServerHealthy())
                {
                    StartServer();
                }
            });
        }

        private void InitializeComponent()
        {
            this.Text = "منظومة الموارد البشرية - أداة تشغيل خادم الواتساب الاحتياطي";
            this.Size = new Size(570, 490);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.RightToLeft = RightToLeft.Yes;
            this.RightToLeftLayout = true;
            this.BackColor = Color.FromArgb(248, 250, 252);
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);

            // العنوان الرئيسي
            Label header = new Label();
            header.Text = "منظومة إدارة الموارد البشرية والرواتب";
            header.Font = new Font("Segoe UI", 13f, FontStyle.Bold);
            header.ForeColor = Color.FromArgb(15, 23, 42);
            header.Location = new Point(20, 16);
            header.Size = new Size(515, 30);
            this.Controls.Add(header);

            // الوصف
            Label subHeader = new Label();
            subHeader.Text = "أداة تشغيل خادم الواتساب الاحتياطي لربط الهواتف والمتصفحات 24/7";
            subHeader.ForeColor = Color.FromArgb(100, 116, 139);
            subHeader.Location = new Point(20, 46);
            subHeader.Size = new Size(515, 24);
            this.Controls.Add(subHeader);

            // بانل الحالة
            statusPanel = new Panel();
            statusPanel.Location = new Point(20, 76);
            statusPanel.Size = new Size(515, 48);
            statusPanel.BackColor = Color.FromArgb(241, 245, 249);
            statusPanel.BorderStyle = BorderStyle.FixedSingle;
            this.Controls.Add(statusPanel);

            statusLabel = new Label();
            statusLabel.Text = "⏳ جاري فحص حالة خادم الواتساب...";
            statusLabel.Font = new Font("Segoe UI", 10.5f, FontStyle.Bold);
            statusLabel.ForeColor = Color.FromArgb(30, 41, 59);
            statusLabel.Location = new Point(10, 12);
            statusLabel.Size = new Size(495, 24);
            statusPanel.Controls.Add(statusLabel);

            // مجموعة الروابط
            GroupBox netGroup = new GroupBox();
            netGroup.Text = "📱 روابط اتصال الهواتف والشبكة المحلية (LAN)";
            netGroup.Location = new Point(20, 136);
            netGroup.Size = new Size(515, 140);
            netGroup.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            this.Controls.Add(netGroup);

            netText = new TextBox();
            netText.Multiline = true;
            netText.ReadOnly = true;
            netText.ScrollBars = ScrollBars.Vertical;
            netText.Location = new Point(15, 25);
            netText.Size = new Size(485, 68);
            netText.Font = new Font("Consolas", 10f, FontStyle.Bold);
            netText.BackColor = Color.White;
            netText.ForeColor = Color.FromArgb(3, 105, 161);
            netGroup.Controls.Add(netText);

            btnCopy = new Button();
            btnCopy.Text = "📋 نسخ أول رابط للهاتف";
            btnCopy.Location = new Point(15, 100);
            btnCopy.Size = new Size(180, 28);
            btnCopy.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
            btnCopy.BackColor = Color.FromArgb(224, 231, 255);
            btnCopy.ForeColor = Color.FromArgb(67, 56, 202);
            btnCopy.FlatStyle = FlatStyle.Flat;
            btnCopy.FlatAppearance.BorderSize = 0;
            btnCopy.Click += (s, e) =>
            {
                if (ipList.Count > 0)
                {
                    Clipboard.SetText(ipList[0]);
                    MessageBox.Show("تم نسخ الرابط بنجاح: " + ipList[0], "نسخ الرابط", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
            };
            netGroup.Controls.Add(btnCopy);

            // صف أزرار التحكم
            btnStart = new Button();
            btnStart.Text = "⚡ تشغيل الخادم";
            btnStart.Location = new Point(375, 290);
            btnStart.Size = new Size(160, 42);
            btnStart.Font = new Font("Segoe UI", 10f, FontStyle.Bold);
            btnStart.BackColor = Color.FromArgb(16, 185, 129);
            btnStart.ForeColor = Color.White;
            btnStart.FlatStyle = FlatStyle.Flat;
            btnStart.FlatAppearance.BorderSize = 0;
            btnStart.Click += (s, e) => { StartServer(); };
            this.Controls.Add(btnStart);

            btnFirewall = new Button();
            btnFirewall.Text = "🛡️ فتح جدار الحماية";
            btnFirewall.Location = new Point(205, 290);
            btnFirewall.Size = new Size(160, 42);
            btnFirewall.Font = new Font("Segoe UI", 10f, FontStyle.Bold);
            btnFirewall.BackColor = Color.FromArgb(59, 130, 246);
            btnFirewall.ForeColor = Color.White;
            btnFirewall.FlatStyle = FlatStyle.Flat;
            btnFirewall.FlatAppearance.BorderSize = 0;
            btnFirewall.Click += (s, e) => { ConfigureFirewall(); };
            this.Controls.Add(btnFirewall);

            btnStop = new Button();
            btnStop.Text = "⏹️ إيقاف الخادم";
            btnStop.Location = new Point(20, 290);
            btnStop.Size = new Size(175, 42);
            btnStop.Font = new Font("Segoe UI", 10f, FontStyle.Bold);
            btnStop.BackColor = Color.FromArgb(239, 68, 68);
            btnStop.ForeColor = Color.White;
            btnStop.FlatStyle = FlatStyle.Flat;
            btnStop.FlatAppearance.BorderSize = 0;
            btnStop.Click += (s, e) => { StopServer(); };
            this.Controls.Add(btnStop);

            // زر إغلاق
            btnClose = new Button();
            btnClose.Text = "✕ إغلاق النافذة";
            btnClose.Location = new Point(20, 350);
            btnClose.Size = new Size(515, 38);
            btnClose.BackColor = Color.FromArgb(241, 245, 249);
            btnClose.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            btnClose.FlatStyle = FlatStyle.Flat;
            btnClose.FlatAppearance.BorderSize = 0;
            btnClose.Click += (s, e) => { this.Close(); };
            this.Controls.Add(btnClose);

            // مؤقت فحص دوري كل 3 ثوانٍ
            timer = new System.Windows.Forms.Timer();
            timer.Interval = 3000;
            timer.Tick += (s, e) => { CheckHealth(); };
            timer.Start();
        }

        private void LoadNetworkIps()
        {
            ipList.Clear();
            try
            {
                foreach (NetworkInterface ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.OperationalStatus != OperationalStatus.Up || ni.NetworkInterfaceType == NetworkInterfaceType.Loopback)
                        continue;

                    foreach (UnicastIPAddressInformation ip in ni.GetIPProperties().UnicastAddresses)
                    {
                        if (ip.Address.AddressFamily == AddressFamily.InterNetwork)
                        {
                            string addr = ip.Address.ToString();
                            if (!addr.StartsWith("127.") && !addr.StartsWith("169.254."))
                            {
                                ipList.Add("http://" + addr + ":3100");
                            }
                        }
                    }
                }
            }
            catch { }

            if (ipList.Count == 0)
            {
                ipList.Add("http://127.0.0.1:3100");
            }

            netText.Text = string.Join(Environment.NewLine, ipList.ToArray());
        }

        private bool IsServerHealthy()
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:3100/health");
                req.Timeout = 1200;
                using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
                {
                    return res.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        private void CheckHealth()
        {
            ThreadPool.QueueUserWorkItem(state =>
            {
                bool healthy = IsServerHealthy();
                if (this.IsDisposed || !this.IsHandleCreated) return;

                this.BeginInvoke((MethodInvoker)delegate
                {
                    if (healthy)
                    {
                        statusPanel.BackColor = Color.FromArgb(209, 250, 229);
                        statusLabel.Text = "🟢 خادم الواتساب متصل ويعمل بنجاح (المنفذ 3100)";
                        statusLabel.ForeColor = Color.FromArgb(4, 120, 87);
                    }
                    else
                    {
                        statusPanel.BackColor = Color.FromArgb(254, 226, 226);
                        statusLabel.Text = "🔴 خادم الواتساب متوقف حالياً";
                        statusLabel.ForeColor = Color.FromArgb(185, 28, 28);
                    }
                });
            });
        }

        private void KillPort3100()
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = "-NoProfile -Command \"Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }\"",
                    WindowStyle = ProcessWindowStyle.Hidden,
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                using (Process p = Process.Start(psi))
                {
                    p.WaitForExit(3000);
                }
            }
            catch { }
        }

        private void StartServer()
        {
            KillPort3100();

            string serverJs = FindServerJs();
            if (string.IsNullOrEmpty(serverJs) || !File.Exists(serverJs))
            {
                return;
            }

            string nodeExe = FindNodeExe(serverJs);
            bool isElectronNode = nodeExe.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) && !nodeExe.ToLower().Contains("node.exe");

            try
            {
                string appDir = Path.GetDirectoryName(serverJs);
                string nodeModulesDir = Path.Combine(Path.GetDirectoryName(appDir), "node_modules");

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = nodeExe,
                    Arguments = "\"" + serverJs + "\"",
                    WorkingDirectory = appDir,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    CreateNoWindow = true,
                    UseShellExecute = false
                };

                if (Directory.Exists(nodeModulesDir))
                {
                    psi.EnvironmentVariables["NODE_PATH"] = nodeModulesDir;
                }

                if (isElectronNode)
                {
                    psi.EnvironmentVariables["ELECTRON_RUN_AS_NODE"] = "1";
                }

                psi.EnvironmentVariables["PORT"] = "3100";
                psi.EnvironmentVariables["NODE_ENV"] = "production";

                Process.Start(psi);
                Thread.Sleep(2000);
                CheckHealth();
            }
            catch (Exception ex)
            {
                MessageBox.Show("حدث خطأ أثناء تشغيل الخادم: " + ex.Message, "خطأ", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void StopServer()
        {
            KillPort3100();
            Thread.Sleep(600);
            CheckHealth();
        }

        private void ConfigureFirewall()
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "netsh",
                    Arguments = "advfirewall firewall add rule name=\"WhatsApp_Server_3100\" dir=in action=allow protocol=TCP localport=3100 profile=any description=\"Allow incoming WhatsApp Gateway connections on port 3100\"",
                    Verb = "runas",
                    WindowStyle = ProcessWindowStyle.Hidden,
                    UseShellExecute = true
                };
                using (Process p = Process.Start(psi))
                {
                    p.WaitForExit();
                }
                MessageBox.Show("تم السماح للمنفذ 3100 في جدار الحماية بنجاح! 🛡️", "جدار الحماية", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch
            {
                MessageBox.Show("تعذر تعديل جدار الحماية أو تم رفض طلب الصلاحيات.", "تنبيه", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private string FindServerJs()
        {
            // 1. فحص سجل الويندوز للبحث عن مسار التثبيت الفعلي
            try
            {
                string[] regKeys = new string[]
                {
                    @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\com.pharmacy.hr.system",
                    @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\com.pharmacy.hr.system",
                    @"SOFTWARE\pharmacy-hr-system",
                    @"SOFTWARE\منظومة الموارد البشرية"
                };

                foreach (string rk in regKeys)
                {
                    using (RegistryKey key = Registry.LocalMachine.OpenSubKey(rk))
                    {
                        if (key != null)
                        {
                            object loc = key.GetValue("InstallLocation");
                            if (loc != null && !string.IsNullOrEmpty(loc.ToString()))
                            {
                                string p = Path.Combine(loc.ToString(), "resources", "app.asar.unpacked", "server", "whatsapp-server.js");
                                if (File.Exists(p)) return p;
                            }
                        }
                    }
                    using (RegistryKey key = Registry.CurrentUser.OpenSubKey(rk))
                    {
                        if (key != null)
                        {
                            object loc = key.GetValue("InstallLocation");
                            if (loc != null && !string.IsNullOrEmpty(loc.ToString()))
                            {
                                string p = Path.Combine(loc.ToString(), "resources", "app.asar.unpacked", "server", "whatsapp-server.js");
                                if (File.Exists(p)) return p;
                            }
                        }
                    }
                }
            }
            catch { }

            // 2. فحص مجلدات التثبيت التلقائية في النظام
            string appBase = AppDomain.CurrentDomain.BaseDirectory;
            string progFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string progFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

            List<string> candidates = new List<string>
            {
                // مسارات بجوار أداة التشغيل
                Path.Combine(appBase, "server", "whatsapp-server.js"),
                Path.Combine(appBase, "whatsapp-server.js"),
                Path.Combine(appBase, "..", "server", "whatsapp-server.js"),
                Path.Combine(appBase, "resources", "app.asar.unpacked", "server", "whatsapp-server.js"),

                // مسار التثبيت الحقيقي الرئيسي (pharmacy-hr-system)
                Path.Combine(progFiles, @"pharmacy-hr-system\resources\app.asar.unpacked\server\whatsapp-server.js"),
                Path.Combine(progFilesX86, @"pharmacy-hr-system\resources\app.asar.unpacked\server\whatsapp-server.js"),
                @"C:\Program Files\pharmacy-hr-system\resources\app.asar.unpacked\server\whatsapp-server.js",
                @"C:\Program Files (x86)\pharmacy-hr-system\resources\app.asar.unpacked\server\whatsapp-server.js",
                Path.Combine(localApp, @"Programs\pharmacy-hr-system\resources\app.asar.unpacked\server\whatsapp-server.js"),

                // مسار التثبيت بالاسم التجاري (منظومة الموارد البشرية)
                Path.Combine(progFiles, @"منظومة الموارد البشرية\resources\app.asar.unpacked\server\whatsapp-server.js"),
                Path.Combine(progFilesX86, @"منظومة الموارد البشرية\resources\app.asar.unpacked\server\whatsapp-server.js"),
                @"C:\Program Files\منظومة الموارد البشرية\resources\app.asar.unpacked\server\whatsapp-server.js",
                Path.Combine(localApp, @"Programs\منظومة الموارد البشرية\resources\app.asar.unpacked\server\whatsapp-server.js"),

                // مسار بيئة التطوير
                @"d:\Project\HR last\HR New\server\whatsapp-server.js"
            };

            foreach (string c in candidates)
            {
                if (!string.IsNullOrEmpty(c) && File.Exists(c)) return c;
            }

            // فحص كافة الأقراص المتاحة (C, D, E, F...)
            foreach (string drive in new string[] { "C:\\", "D:\\", "E:\\", "F:\\", "G:\\" })
            {
                string p1 = Path.Combine(drive, @"Program Files\pharmacy-hr-system\resources\app.asar.unpacked\server\whatsapp-server.js");
                if (File.Exists(p1)) return p1;
                string p2 = Path.Combine(drive, @"Program Files (x86)\pharmacy-hr-system\resources\app.asar.unpacked\server\whatsapp-server.js");
                if (File.Exists(p2)) return p2;
                string p3 = Path.Combine(drive, @"Project\HR last\HR New\server\whatsapp-server.js");
                if (File.Exists(p3)) return p3;
            }

            // 3. خيار يدوي تفاعلي إذا تم تثبيت البرنامج في مجلد مخصص غير قياسي
            DialogResult dr = MessageBox.Show(
                "تعذر العثور على ملف whatsapp-server.js تلقائياً على هذا الجهاز.\n\nهل ترغب في تحديد مجلد تثبيت (منظومة الموارد البشرية) يدوياً؟",
                "تحديد مسار المنظومة",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question
            );
            if (dr == DialogResult.Yes)
            {
                using (FolderBrowserDialog fbd = new FolderBrowserDialog())
                {
                    fbd.Description = "اختر مجلد تثبيت منظومة الموارد البشرية (مثال: C:\\Program Files\\pharmacy-hr-system)";
                    if (fbd.ShowDialog() == DialogResult.OK)
                    {
                        string manualTarget = Path.Combine(fbd.SelectedPath, "resources", "app.asar.unpacked", "server", "whatsapp-server.js");
                        if (File.Exists(manualTarget)) return manualTarget;
                        string directTarget = Path.Combine(fbd.SelectedPath, "server", "whatsapp-server.js");
                        if (File.Exists(directTarget)) return directTarget;
                        string singleTarget = Path.Combine(fbd.SelectedPath, "whatsapp-server.js");
                        if (File.Exists(singleTarget)) return singleTarget;
                    }
                }
            }

            return null;
        }

        private string FindNodeExe(string serverJsPath)
        {
            // 1. استخدام محرك المنظومة التنفيذي المدمج في نفس مجلد التثبيت
            if (!string.IsNullOrEmpty(serverJsPath))
            {
                try
                {
                    string dir = Path.GetDirectoryName(serverJsPath);
                    for (int i = 0; i < 5; i++)
                    {
                        if (string.IsNullOrEmpty(dir)) break;
                        string exe1 = Path.Combine(dir, "منظومة الموارد البشرية.exe");
                        if (File.Exists(exe1)) return exe1;
                        string exe2 = Path.Combine(dir, "pharmacy-hr-system.exe");
                        if (File.Exists(exe2)) return exe2;
                        dir = Path.GetDirectoryName(dir);
                    }
                }
                catch { }
            }

            // 2. فحص مسارات التثبيت القياسية
            string progFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string progFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

            string[] candidates = new string[]
            {
                Path.Combine(progFiles, @"pharmacy-hr-system\منظومة الموارد البشرية.exe"),
                Path.Combine(progFilesX86, @"pharmacy-hr-system\منظومة الموارد البشرية.exe"),
                @"C:\Program Files\pharmacy-hr-system\منظومة الموارد البشرية.exe",
                @"C:\Program Files (x86)\pharmacy-hr-system\منظومة الموارد البشرية.exe",
                Path.Combine(progFiles, @"منظومة الموارد البشرية\منظومة الموارد البشرية.exe"),
                Path.Combine(progFilesX86, @"منظومة الموارد البشرية\منظومة الموارد البشرية.exe"),
                Path.Combine(localApp, @"Programs\pharmacy-hr-system\منظومة الموارد البشرية.exe"),
                Path.Combine(localApp, @"Programs\منظومة الموارد البشرية\منظومة الموارد البشرية.exe"),
                Path.Combine(progFiles, @"nodejs\node.exe"),
                Path.Combine(progFilesX86, @"nodejs\node.exe"),
                @"C:\Program Files\nodejs\node.exe",
                Path.Combine(localApp, @"Programs\node\node.exe")
            };

            foreach (string c in candidates)
            {
                if (File.Exists(c)) return c;
            }

            return "node";
        }
    }
}
