import React from 'react';
import ToolCard from './ToolCard';
import { Building2, Users, BrainCircuit } from 'lucide-react';

const tools = [
  {
    title: 'Business Search',
    description: 'Search and discover company profiles, market data, and key financials.',
    icon: Building2,
    themeClass: 'card-business'
  },
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
