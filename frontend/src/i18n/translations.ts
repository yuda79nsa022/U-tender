export interface Dictionary {
  common: { loading: string; save: string; cancel: string; back: string };
  brand: { tagline: string };
  home: { login: string; signup: string };
  header: { logOut: string; account: string };
  language: { label: string; en: string; ar: string };
  auth: {
    login: {
      heading: string;
      email: string;
      password: string;
      submit: string;
      submitting: string;
      noAccount: string;
      signupLink: string;
      forgotPassword: string;
      genericError: string;
    };
    signup: {
      heading: string;
      iAmA: string;
      propertyOwner: string;
      contractor: string;
      companyName: string;
      companyNameHint: string;
      fullName: string;
      email: string;
      password: string;
      submit: string;
      submitting: string;
      haveAccount: string;
      loginLink: string;
      genericError: string;
    };
    forgotPassword: {
      heading: string;
      description: string;
      email: string;
      submit: string;
      submitting: string;
      sent: string;
      backToLogin: string;
    };
    resetPassword: {
      heading: string;
      newPassword: string;
      submit: string;
      submitting: string;
      success: string;
      invalidToken: string;
      goToLogin: string;
      requestNew: string;
      missingToken: string;
    };
    verifyEmail: {
      heading: string;
      success: string;
      invalidToken: string;
      continue: string;
      missingToken: string;
    };
    changePassword: {
      heading: string;
      currentPassword: string;
      newPassword: string;
      submit: string;
      submitting: string;
      success: string;
    };
    emailVerifyBanner: { message: string; resend: string; sent: string };
  };
}

export const en: Dictionary = {
  common: {
    loading: "Loading…",
    save: "Save",
    cancel: "Cancel",
    back: "Back",
  },
  brand: {
    tagline: "Drawings in. Offers out.",
  },
  home: {
    login: "Log in",
    signup: "Sign up",
  },
  header: {
    logOut: "Log out",
    account: "Account",
  },
  language: {
    label: "Language",
    en: "English",
    ar: "العربية",
  },
  auth: {
    login: {
      heading: "Log in",
      email: "Email",
      password: "Password",
      submit: "Log in",
      submitting: "Logging in…",
      noAccount: "No account?",
      signupLink: "Sign up",
      forgotPassword: "Forgot password?",
      genericError: "Invalid email or password.",
    },
    signup: {
      heading: "Create an account",
      iAmA: "I am a...",
      propertyOwner: "Property owner",
      contractor: "Contractor",
      companyName: "Company name",
      companyNameHint: "You'll submit verification documents after signing up.",
      fullName: "Full name",
      email: "Email",
      password: "Password",
      submit: "Create account",
      submitting: "Creating…",
      haveAccount: "Already have an account?",
      loginLink: "Log in",
      genericError: "Could not create account.",
    },
    forgotPassword: {
      heading: "Reset your password",
      description: "Enter your account email and we'll send you a link to reset your password.",
      email: "Email",
      submit: "Send reset link",
      submitting: "Sending…",
      sent: "If an account with that email exists, a reset link has been sent.",
      backToLogin: "Back to log in",
    },
    resetPassword: {
      heading: "Choose a new password",
      newPassword: "New password",
      submit: "Reset password",
      submitting: "Resetting…",
      success: "Your password has been reset. You can now log in.",
      invalidToken: "This reset link is invalid or has expired.",
      goToLogin: "Go to log in",
      requestNew: "Request a new reset link",
      missingToken: "No reset token was provided.",
    },
    verifyEmail: {
      heading: "Verifying your email…",
      success: "Your email address has been verified.",
      invalidToken: "This verification link is invalid or has expired.",
      continue: "Continue",
      missingToken: "No verification token was provided.",
    },
    changePassword: {
      heading: "Change password",
      currentPassword: "Current password",
      newPassword: "New password",
      submit: "Change password",
      submitting: "Changing…",
      success: "Password changed.",
    },
    emailVerifyBanner: {
      message: "Please verify your email address.",
      resend: "Resend verification email",
      sent: "Verification email sent.",
    },
  },
};

export const ar: Dictionary = {
  common: {
    loading: "جارٍ التحميل…",
    save: "حفظ",
    cancel: "إلغاء",
    back: "رجوع",
  },
  brand: {
    tagline: "المخططات تدخل، والعروض تخرج.",
  },
  home: {
    login: "تسجيل الدخول",
    signup: "إنشاء حساب",
  },
  header: {
    logOut: "تسجيل الخروج",
    account: "الحساب",
  },
  language: {
    label: "اللغة",
    en: "English",
    ar: "العربية",
  },
  auth: {
    login: {
      heading: "تسجيل الدخول",
      email: "البريد الإلكتروني",
      password: "كلمة المرور",
      submit: "تسجيل الدخول",
      submitting: "جارٍ تسجيل الدخول…",
      noAccount: "ليس لديك حساب؟",
      signupLink: "إنشاء حساب",
      forgotPassword: "نسيت كلمة المرور؟",
      genericError: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    },
    signup: {
      heading: "إنشاء حساب",
      iAmA: "أنا...",
      propertyOwner: "مالك عقار",
      contractor: "مقاول",
      companyName: "اسم الشركة",
      companyNameHint: "ستقوم بتقديم مستندات التحقق بعد إنشاء الحساب.",
      fullName: "الاسم الكامل",
      email: "البريد الإلكتروني",
      password: "كلمة المرور",
      submit: "إنشاء الحساب",
      submitting: "جارٍ الإنشاء…",
      haveAccount: "لديك حساب بالفعل؟",
      loginLink: "تسجيل الدخول",
      genericError: "تعذر إنشاء الحساب.",
    },
    forgotPassword: {
      heading: "إعادة تعيين كلمة المرور",
      description: "أدخل البريد الإلكتروني لحسابك، وسنرسل لك رابطًا لإعادة تعيين كلمة المرور.",
      email: "البريد الإلكتروني",
      submit: "إرسال رابط إعادة التعيين",
      submitting: "جارٍ الإرسال…",
      sent: "إذا كان هناك حساب مرتبط بهذا البريد الإلكتروني، فسيتم إرسال رابط إعادة التعيين إليه.",
      backToLogin: "العودة إلى تسجيل الدخول",
    },
    resetPassword: {
      heading: "اختر كلمة مرور جديدة",
      newPassword: "كلمة المرور الجديدة",
      submit: "إعادة تعيين كلمة المرور",
      submitting: "جارٍ إعادة التعيين…",
      success: "تم إعادة تعيين كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول.",
      invalidToken: "رابط إعادة التعيين غير صالح أو منتهي الصلاحية.",
      goToLogin: "الذهاب إلى تسجيل الدخول",
      requestNew: "طلب رابط جديد لإعادة التعيين",
      missingToken: "لم يتم توفير رمز إعادة التعيين.",
    },
    verifyEmail: {
      heading: "جارٍ التحقق من بريدك الإلكتروني…",
      success: "تم التحقق من بريدك الإلكتروني بنجاح.",
      invalidToken: "رابط التحقق غير صالح أو منتهي الصلاحية.",
      continue: "متابعة",
      missingToken: "لم يتم توفير رمز التحقق.",
    },
    changePassword: {
      heading: "تغيير كلمة المرور",
      currentPassword: "كلمة المرور الحالية",
      newPassword: "كلمة المرور الجديدة",
      submit: "تغيير كلمة المرور",
      submitting: "جارٍ التغيير…",
      success: "تم تغيير كلمة المرور.",
    },
    emailVerifyBanner: {
      message: "يرجى تأكيد بريدك الإلكتروني.",
      resend: "إعادة إرسال رسالة التحقق",
      sent: "تم إرسال رسالة التحقق.",
    },
  },
};
