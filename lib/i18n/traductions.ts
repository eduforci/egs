// Traductions. La clé est le texte français tel qu'il est écrit dans le code.
// Pour traduire un nouvel écran : entourer son texte de t('...') et ajouter la ligne ici (au moins en anglais).
// Une ligne manquante dans une langue n'est jamais bloquante : le texte reste en français.

import type { Langue } from '@/lib/i18n/langues';

type Dico = Record<string, string>;

// [anglais, espagnol, allemand, portugais, chinois, arabe]
const LIGNES: Record<string, [string, string, string, string, string, string]> = {
  // ---- Titres des groupes du menu
  'TABLEAU DE BORD': ['DASHBOARD', 'PANEL', 'ÜBERSICHT', 'PAINEL', '仪表盘', 'لوحة القيادة'],
  'GESTION': ['MANAGEMENT', 'GESTIÓN', 'VERWALTUNG', 'GESTÃO', '管理', 'الإدارة'],
  'SUIVI PÉDAGOGIQUE': ['ACADEMIC MONITORING', 'SEGUIMIENTO PEDAGÓGICO', 'PÄDAGOGISCHE BETREUUNG', 'ACOMPANHAMENTO PEDAGÓGICO', '教学跟踪', 'المتابعة التربوية'],
  'ADMINISTRATION OFFICIELLE': ['OFFICIAL ADMINISTRATION', 'ADMINISTRACIÓN OFICIAL', 'OFFIZIELLE VERWALTUNG', 'ADMINISTRAÇÃO OFICIAL', '官方行政', 'الإدارة الرسمية'],
  'FINANCES': ['FINANCE', 'FINANZAS', 'FINANZEN', 'FINANÇAS', '财务', 'المالية'],
  'COMMUNICATION SMS': ['SMS COMMUNICATION', 'COMUNICACIÓN SMS', 'SMS-KOMMUNIKATION', 'COMUNICAÇÃO POR SMS', '短信通讯', 'التواصل عبر الرسائل القصيرة'],
  'COMMUNICATION': ['COMMUNICATION', 'COMUNICACIÓN', 'KOMMUNIKATION', 'COMUNICAÇÃO', '沟通', 'التواصل'],
  'POINTAGE': ['ATTENDANCE CLOCK-IN', 'CONTROL DE ASISTENCIA', 'ZEITERFASSUNG', 'REGISTO DE PONTO', '考勤打卡', 'تسجيل الحضور'],
  'DOCUMENTS': ['DOCUMENTS', 'DOCUMENTOS', 'DOKUMENTE', 'DOCUMENTOS', '文件', 'المستندات'],
  'SUIVI': ['MONITORING', 'SEGUIMIENTO', 'BETREUUNG', 'ACOMPANHAMENTO', '跟踪', 'المتابعة'],
  "COMPTES DE L'ÉCOLE": ['SCHOOL ACCOUNTS', 'CUENTAS DE LA ESCUELA', 'SCHULKONTEN', 'CONTAS DA ESCOLA', '学校账户', 'حسابات المدرسة'],

  // ---- Liens du menu
  'Accueil': ['Home', 'Inicio', 'Startseite', 'Início', '首页', 'الرئيسية'],
  'Mon profil': ['My profile', 'Mi perfil', 'Mein Profil', 'Meu perfil', '我的资料', 'ملفي الشخصي'],
  'Classes': ['Classes', 'Clases', 'Klassen', 'Turmas', '班级', 'الأقسام'],
  'Élèves': ['Students', 'Alumnos', 'Schüler', 'Alunos', '学生', 'التلاميذ'],
  'Enseignants': ['Teachers', 'Profesores', 'Lehrer', 'Professores', '教师', 'الأساتذة'],
  'Répartir en classes': ['Assign to classes', 'Distribuir en clases', 'Auf Klassen verteilen', 'Distribuir por turmas', '分班', 'توزيع التلاميذ على الأقسام'],
  'Parents': ['Parents', 'Padres', 'Eltern', 'Encarregados de educação', '家长', 'أولياء الأمور'],
  'Personnel': ['Staff', 'Personal', 'Personal', 'Pessoal', '员工', 'الموظفون'],
  'Emploi du temps': ['Timetable', 'Horario', 'Stundenplan', 'Horário', '课程表', 'الجدول الزمني'],
  'Grille horaire': ['Time grid', 'Franja horaria', 'Zeitraster', 'Grelha horária', '时间表格', 'الشبكة الزمنية'],
  'Planning (volumes, vacataires)': ['Planning (hours, part-time teachers)', 'Planificación (horas, profesores externos)', 'Planung (Stundenumfang, Honorarkräfte)', 'Planeamento (carga horária, professores contratados)', '排课规划（课时、兼职教师）', 'التخطيط (الحصص، الأساتذة المتعاقدون)'],
  'Établissement': ['School', 'Centro educativo', 'Schule', 'Estabelecimento', '学校', 'المؤسسة'],
  "Espaces de l'école": ['School areas', 'Espacios de la escuela', 'Schulbereiche', 'Espaços da escola', '学校区域', 'فضاءات المدرسة'],
  'Examens': ['Exams', 'Exámenes', 'Prüfungen', 'Exames', '考试', 'الامتحانات'],
  'Bulletins': ['Report cards', 'Boletines', 'Zeugnisse', 'Boletins', '成绩单', 'كشوف النقط'],
  'Validation des notes': ['Grade validation', 'Validación de notas', 'Notenfreigabe', 'Validação das notas', '成绩审核', 'اعتماد النقط'],
  'Résultats': ['Results', 'Resultados', 'Ergebnisse', 'Resultados', '成绩结果', 'النتائج'],
  'Absences': ['Absences', 'Ausencias', 'Fehlzeiten', 'Faltas', '缺勤', 'الغيابات'],
  'Statistiques DESPS': ['DESPS statistics', 'Estadísticas DESPS', 'DESPS-Statistiken', 'Estatísticas DESPS', 'DESPS统计', 'إحصاءات DESPS'],
  'Code établissement': ['School code', 'Código del centro', 'Schulcode', 'Código do estabelecimento', '学校代码', 'رمز المؤسسة'],
  'Élèves sans matricule': ['Students without ID number', 'Alumnos sin matrícula', 'Schüler ohne Matrikelnummer', 'Alunos sem matrícula', '无学号学生', 'تلاميذ بدون رقم تسجيل'],
  'Comparer (GAP)': ['Compare (GAP)', 'Comparar (GAP)', 'Vergleichen (GAP)', 'Comparar (GAP)', '比对（GAP）', 'مقارنة (GAP)'],
  'Suivi immatriculation': ['Registration tracking', 'Seguimiento de matriculación', 'Anmeldungsverfolgung', 'Acompanhamento de matrícula', '学籍登记跟踪', 'متابعة التسجيل'],
  'Transferts': ['Transfers', 'Traslados', 'Versetzungen', 'Transferências', '转学', 'التحويلات'],
  'Comptabilité': ['Accounting', 'Contabilidad', 'Buchhaltung', 'Contabilidade', '会计', 'المحاسبة'],
  'Message libre': ['Free message', 'Mensaje libre', 'Freie Nachricht', 'Mensagem livre', '自由短信', 'رسالة حرة'],
  'Relances impayés': ['Payment reminders', 'Recordatorios de impagos', 'Zahlungserinnerungen', 'Lembretes de pagamentos em atraso', '欠费催缴', 'تذكير بالمستحقات غير المسددة'],
  'Messagerie': ['Messaging', 'Mensajería', 'Nachrichten', 'Mensagens', '消息', 'المراسلات'],
  'Badger': ['Clock in', 'Fichar', 'Einstempeln', 'Registar ponto', '打卡', 'تسجيل الحضور'],
  'Configuration': ['Settings', 'Configuración', 'Konfiguration', 'Configuração', '设置', 'الإعدادات'],
  'Suivi du jour': ["Today's tracking", 'Seguimiento del día', 'Tagesübersicht', 'Acompanhamento do dia', '今日跟踪', 'متابعة اليوم'],
  'Justifications': ['Justifications', 'Justificaciones', 'Entschuldigungen', 'Justificações', '请假说明', 'التبريرات'],
  'Rapports': ['Reports', 'Informes', 'Berichte', 'Relatórios', '报告', 'التقارير'],
  'Documents élèves': ['Student documents', 'Documentos de alumnos', 'Schülerdokumente', 'Documentos de alunos', '学生文件', 'مستندات التلاميذ'],
  'Documents enseignants': ['Teacher documents', 'Documentos de profesores', 'Lehrerdokumente', 'Documentos de professores', '教师文件', 'مستندات الأساتذة'],
  'Nouveau membre du personnel': ['New staff member', 'Nuevo miembro del personal', 'Neues Personalmitglied', 'Novo membro do pessoal', '新增员工', 'موظف جديد'],
  'Nouvel élève': ['New student', 'Nuevo alumno', 'Neuer Schüler', 'Novo aluno', '新增学生', 'تلميذ جديد'],
  "Journal d'audit": ['Audit log', 'Registro de auditoría', 'Prüfprotokoll', 'Registo de auditoria', '审计日志', 'سجل التدقيق'],
  'Frais de scolarité': ['School fees', 'Cuotas escolares', 'Schulgebühren', 'Propinas escolares', '学费', 'الرسوم المدرسية'],
  'Rapports financiers': ['Financial reports', 'Informes financieros', 'Finanzberichte', 'Relatórios financeiros', '财务报告', 'التقارير المالية'],
  'Point des appels': ['Roll-call overview', 'Resumen de listas', 'Übersicht der Anwesenheitslisten', 'Resumo das chamadas', '点名汇总', 'ملخص عمليات المناداة'],
  "Résultats d'examens": ['Exam results', 'Resultados de exámenes', 'Prüfungsergebnisse', 'Resultados de exames', '考试成绩', 'نتائج الامتحانات'],
  "Annonces de l'école": ['School announcements', 'Anuncios de la escuela', 'Mitteilungen der Schule', 'Avisos da escola', '学校公告', 'إعلانات المدرسة'],

  // ---- Fonctions affichées sous le nom
  'Administration': ['Administration', 'Administración', 'Verwaltung', 'Administração', '行政部门', 'الإدارة'],
  "Chef d'établissement": ['Head of school', 'Director del centro', 'Schulleiter', 'Diretor do estabelecimento', '校长', 'مدير المؤسسة'],
  'Directeur des études': ['Director of studies', 'Director de estudios', 'Studienleiter', 'Diretor de estudos', '教务主任', 'مدير الدراسات'],
  'Éducateur': ['Educator', 'Educador', 'Erzieher', 'Educador', '学生辅导员', 'المربّي'],
  'Parent': ['Parent', 'Padre/madre', 'Elternteil', 'Encarregado de educação', '家长', 'ولي الأمر'],

  // ---- Interface commune
  'Langue': ['Language', 'Idioma', 'Sprache', 'Idioma', '语言', 'اللغة'],
  'Ouvrir le menu': ['Open menu', 'Abrir el menú', 'Menü öffnen', 'Abrir o menu', '打开菜单', 'فتح القائمة'],
  'Espace de travail': ['Workspace', 'Espacio de trabajo', 'Arbeitsbereich', 'Espaço de trabalho', '工作区', 'فضاء العمل'],
  'Tous mes espaces': ['All my workspaces', 'Todos mis espacios', 'Alle meine Bereiche', 'Todos os meus espaços', '全部工作区', 'كل فضاءاتي'],
  'Retour à mon espace': ['Back to my area', 'Volver a mi espacio', 'Zurück zu meinem Bereich', 'Voltar ao meu espaço', '返回我的专区', 'العودة إلى فضائي'],

  // ---- Espace enseignant
  'Espace enseignant': ['Teacher area', 'Área del profesor', 'Lehrerbereich', 'Área do professor', '教师专区', 'فضاء الأستاذ'],
  'Appel': ['Roll call', 'Pasar lista', 'Anwesenheit', 'Chamada', '点名', 'المناداة'],
  'Cahier de texte': ['Class log', 'Cuaderno de clase', 'Klassenbuch', 'Livro de sumários', '课堂日志', 'دفتر النصوص'],

  // ---- Page de connexion
  'La gestion scolaire réinventée': ['School management, reinvented', 'La gestión escolar reinventada', 'Schulverwaltung neu gedacht', 'A gestão escolar reinventada', '学校管理，焕然一新', 'إدارة مدرسية بحلّة جديدة'],
  'Connexion à votre espace': ['Sign in to your account', 'Acceda a su espacio', 'Melden Sie sich in Ihrem Bereich an', 'Aceda ao seu espaço', '登录您的账户', 'تسجيل الدخول إلى فضائك'],
  'Email ou Identifiant': ['Email or ID', 'Correo electrónico o identificador', 'E-Mail oder Kennung', 'E-mail ou identificador', '邮箱或账号', 'البريد الإلكتروني أو المعرّف'],
  'vous@etablissement.ci ou ENS-0001': ['you@school.ci or ENS-0001', 'usted@centro.ci o ENS-0001', 'sie@schule.ci oder ENS-0001', 'voce@escola.ci ou ENS-0001', 'you@school.ci 或 ENS-0001', 'you@school.ci أو ENS-0001'],
  'Mot de passe': ['Password', 'Contraseña', 'Passwort', 'Palavra-passe', '密码', 'كلمة المرور'],
  'Masquer le mot de passe': ['Hide password', 'Ocultar contraseña', 'Passwort verbergen', 'Ocultar palavra-passe', '隐藏密码', 'إخفاء كلمة المرور'],
  'Afficher le mot de passe': ['Show password', 'Mostrar contraseña', 'Passwort anzeigen', 'Mostrar palavra-passe', '显示密码', 'إظهار كلمة المرور'],
  'Se souvenir de moi': ['Remember me', 'Recordarme', 'Angemeldet bleiben', 'Lembrar-me', '记住我', 'تذكّرني'],
  'Mot de passe oublié ?': ['Forgot password?', '¿Olvidó su contraseña?', 'Passwort vergessen?', 'Esqueceu a palavra-passe?', '忘记密码？', 'هل نسيت كلمة المرور؟'],
  'Se connecter': ['Sign in', 'Iniciar sesión', 'Anmelden', 'Entrar', '登录', 'تسجيل الدخول'],
  'Mot de passe oublié': ['Forgot password', 'Contraseña olvidada', 'Passwort vergessen', 'Palavra-passe esquecida', '忘记密码', 'نسيت كلمة المرور'],
  'Saisissez votre email, nous vous enverrons un lien de réinitialisation.': [
    "Enter your email and we'll send you a reset link.",
    'Introduzca su correo y le enviaremos un enlace para restablecerla.',
    'Geben Sie Ihre E-Mail-Adresse ein, wir senden Ihnen einen Link zum Zurücksetzen.',
    'Introduza o seu e-mail e enviaremos uma ligação para a redefinir.',
    '请输入您的邮箱，我们将发送重置链接给您。',
    'أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين.',
  ],
  'Un email a été envoyé à': ['An email has been sent to', 'Se ha enviado un correo a', 'Eine E-Mail wurde gesendet an', 'Foi enviado um e-mail para', '已发送邮件至', 'تم إرسال رسالة إلى'],
  "Suivez le lien qu'il contient pour choisir un nouveau mot de passe.": [
    'Follow the link it contains to choose a new password.',
    'Siga el enlace que contiene para elegir una nueva contraseña.',
    'Folgen Sie dem enthaltenen Link, um ein neues Passwort zu wählen.',
    'Siga a ligação que contém para escolher uma nova palavra-passe.',
    '请点击邮件中的链接设置新密码。',
    'اتبع الرابط الوارد فيها لاختيار كلمة مرور جديدة.',
  ],
  'Retour à la connexion': ['Back to sign in', 'Volver al inicio de sesión', 'Zurück zur Anmeldung', 'Voltar ao início de sessão', '返回登录', 'العودة إلى تسجيل الدخول'],
  'Envoyer le lien': ['Send the link', 'Enviar el enlace', 'Link senden', 'Enviar a ligação', '发送链接', 'إرسال الرابط'],
  'Annuler': ['Cancel', 'Cancelar', 'Abbrechen', 'Cancelar', '取消', 'إلغاء'],
  "Besoin d'aide ?": ['Need help?', '¿Necesita ayuda?', 'Brauchen Sie Hilfe?', 'Precisa de ajuda?', '需要帮助？', 'هل تحتاج إلى مساعدة؟'],
  'Téléphone :': ['Phone:', 'Teléfono:', 'Telefon:', 'Telefone:', '电话：', 'الهاتف:'],
  'Identifiants incorrects. Vérifiez votre email/identifiant et mot de passe.': [
    'Incorrect credentials. Check your email/ID and password.',
    'Credenciales incorrectas. Compruebe su correo/identificador y su contraseña.',
    'Ungültige Zugangsdaten. Prüfen Sie E-Mail/Kennung und Passwort.',
    'Credenciais incorretas. Verifique o e-mail/identificador e a palavra-passe.',
    '账号或密码不正确，请检查邮箱/账号和密码。',
    'بيانات الدخول غير صحيحة. تحقق من البريد الإلكتروني/المعرّف وكلمة المرور.',
  ],
  'Identifiants incorrects. Vérifiez votre email et mot de passe.': [
    'Incorrect credentials. Check your email and password.',
    'Credenciales incorrectas. Compruebe su correo y su contraseña.',
    'Ungültige Zugangsdaten. Prüfen Sie E-Mail und Passwort.',
    'Credenciais incorretas. Verifique o e-mail e a palavra-passe.',
    '账号或密码不正确，请检查邮箱和密码。',
    'بيانات الدخول غير صحيحة. تحقق من البريد الإلكتروني وكلمة المرور.',
  ],
  'Une erreur est survenue. Réessayez dans quelques instants.': [
    'Something went wrong. Please try again in a moment.',
    'Se ha producido un error. Inténtelo de nuevo en unos instantes.',
    'Ein Fehler ist aufgetreten. Bitte versuchen Sie es gleich noch einmal.',
    'Ocorreu um erro. Tente novamente dentro de instantes.',
    '出现错误，请稍后重试。',
    'حدث خطأ. أعد المحاولة بعد قليل.',
  ],
  'Renseignez votre email ou identifiant ci-dessus avant de continuer.': [
    'Enter your email or ID above before continuing.',
    'Introduzca su correo o identificador arriba antes de continuar.',
    'Geben Sie oben Ihre E-Mail oder Kennung ein, bevor Sie fortfahren.',
    'Preencha acima o seu e-mail ou identificador antes de continuar.',
    '请先在上方填写邮箱或账号。',
    'أدخل بريدك الإلكتروني أو معرّفك أعلاه قبل المتابعة.',
  ],
  'Aucun compte ne correspond à cet email/identifiant.': [
    'No account matches this email/ID.',
    'Ninguna cuenta coincide con este correo/identificador.',
    'Zu dieser E-Mail/Kennung gibt es kein Konto.',
    'Nenhuma conta corresponde a este e-mail/identificador.',
    '没有与此邮箱/账号匹配的账户。',
    'لا يوجد حساب مطابق لهذا البريد الإلكتروني/المعرّف.',
  ],
};

const ORDRE: Exclude<Langue, 'fr'>[] = ['en', 'es', 'de', 'pt', 'zh', 'ar'];

export const TRADUCTIONS: Record<Exclude<Langue, 'fr'>, Dico> = {
  en: {}, es: {}, de: {}, pt: {}, zh: {}, ar: {},
};
for (const [fr, valeurs] of Object.entries(LIGNES)) {
  ORDRE.forEach((code, i) => {
    TRADUCTIONS[code][fr] = valeurs[i];
  });
}
