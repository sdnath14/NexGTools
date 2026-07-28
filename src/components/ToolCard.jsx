import React from 'react';
import { useNavigate } from 'react-router-dom';

const ToolCard = ({ title, description, icon: Icon, themeClass, link }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    if (link) {
      navigate(link);
    }
  };

  return (
    <div className={`tool-card ${themeClass}`} onClick={handleClick}>
      <div className="icon-container">
        <Icon size={40} strokeWidth={1.5} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
};

export default ToolCard;
