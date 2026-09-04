import React from 'react';
import ToolCard from './ToolCard';
import { BarChart3, Users, BrainCircuit } from 'lucide-react';

const tools = [
  {
    title: 'Lead Search',
    description: 'Identify and qualify potential business leads and decision-makers.',
    icon: Users,
    themeClass: 'card-lead',
    link: '/lead-search'
  },
  {
    title: 'TenderAI',
    description: 'AI-powered analysis of request for proposals and tender documents.',
    icon: BrainCircuit,
    themeClass: 'card-tender'
  },
  {
    title: 'Business Analytics Platform',
    description: 'Upload Excel data and ask AI for SQL-backed business answers.',
    icon: BarChart3,
    themeClass: 'card-business',
    link: '/data-analytics'
  }
];

const ToolList = () => {
  return (
    <div className="tool-list">
      {tools.map((tool, index) => (
        <ToolCard 
          key={index}
          title={tool.title}
          description={tool.description}
          icon={tool.icon}
          themeClass={tool.themeClass}
          link={tool.link}
        />
      ))}
    </div>
  );
};

export default ToolList;
