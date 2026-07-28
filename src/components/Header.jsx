import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === '/';

  return (
    <header className="header-navbar">
      <div className="navbar-left">
        {!isHome && (
          <button className="nav-back-btn" onClick={() => navigate('/')}>
            <ArrowLeft size={18} /> Back
          </button>
        )}
        <Link to="/" style={{ textDecoration: 'none' }}>
          <h1 className="title" style={{ fontSize: '2rem', margin: 0 }}>NexG <span>Tools</span></h1>
        </Link>
      </div>
      
      <div className="navbar-right">
        <button className="btn">Admin</button>
        <button className="btn btn-outline">Logout</button>
      </div>
    </header>
  );
};

export default Header;
