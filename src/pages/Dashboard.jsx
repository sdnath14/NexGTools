import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Users, BrainCircuit, BookOpen } from 'lucide-react';

const tools = [
  {
    title: 'Lead Search',
    description: 'Identify and qualify potential business leads and decision-makers using Google Places.',
    icon: Users,
    color: '#10b981',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    link: '/lead-search',
    soon: false,
  },
  {
    title: 'Business Search',
    description: 'Search companies across connected sources, scrape source pages, and ask Business AI.',
    icon: Building2,
    color: '#3b82f6',
    bg: '#eff6ff',
    border: '#bfdbfe',
    link: '/business-search',
    soon: false,
  },
  {
    title: 'TenderAI',
    description: 'AI-powered analysis of request for proposals and tender documents.',
    icon: BrainCircuit,
    color: '#8b5cf6',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    link: null,
    soon: true,
  },
  {
    title: 'Knowledge Base',
    description: 'Access central company internal documentation, processes, and guides.',
    icon: BookOpen,
    color: '#0ea5e9',
    bg: '#f0f9ff',
    border: '#bae6fd',
    link: null,
    soon: true,
  },
];



const Dashboard = ({ user }) => {
  const navigate = useNavigate();
  const firstName = user?.name?.split(' ')[0] || 'there';

  return (
    <div className="dash-page">
      <div className="dash-welcome">
        <div className="dash-welcome-text">
          <span>Welcome, {firstName}</span>
          <h1>Welcome to NexG Tools</h1>
          <p>Your gateway to efficient workflows</p>
        </div>
      </div>

      <div className="dash-tools-wrap">
        <div className="dash-section-label">Internal Tools</div>
        <div className="dash-tools-grid">
          {tools.map((tool, i) => (
            <button
              key={i}
              type="button"
              className={`dash-tool-card ${!tool.link ? 'dash-tool-disabled' : ''}`}
              onClick={() => tool.link && navigate(tool.link)}
              style={{ '--card-accent': tool.color, '--card-bg': tool.bg }}
              title={tool.description}
            >
              {tool.soon && <span className="dash-tool-soon">Soon</span>}
              <div className="dash-tool-icon" style={{ background: tool.color }}>
                <tool.icon size={30} />
              </div>
              <h3>{tool.title}</h3>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
