import React, { useEffect, useState } from 'react';

export default function SplashScreen({ onEnter }) {
  const [company, setCompany] = useState(null);

  useEffect(() => {
    window.api.company.get().then(setCompany);
  }, []);

  return (
    <div className="splash-overlay">
      <div className="splash-center">
        {company?.logo_data ? (
          <img className="splash-logo" src={company.logo_data} alt="شعار الشركة" />
        ) : (
          <div className="splash-logo-fallback">☀</div>
        )}
        <h1 className="splash-company">{company?.company_name || 'برنامج تسعير الطاقة الشمسية'}</h1>
        {company?.company_name_en && <p className="splash-company-en">{company.company_name_en}</p>}
        <button className="splash-enter-btn" onClick={onEnter}>
          دخول
        </button>
      </div>
      <div className="splash-dev-credit">تطوير: احمد علي — 07728736250</div>
    </div>
  );
}
