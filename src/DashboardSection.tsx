import { ReactNode, useState } from 'react';

interface Props {
  title: string;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}

export const DashboardSection = ({ title, defaultOpen = false, className = '', children }: Props) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className={`dashboard-section ${isOpen ? 'is-open' : 'is-collapsed'} ${className}`}>
      <button className='dashboard-section-header' type='button' aria-expanded={isOpen} onClick={() => setIsOpen(current => !current)}>
        <span className='dashboard-section-toggle' aria-hidden='true'>
          {isOpen ? '-' : '+'}
        </span>
        <span className='dashboard-section-title'>{title}</span>
      </button>
      {isOpen && <div className='dashboard-section-content'>{children}</div>}
    </section>
  );
};
