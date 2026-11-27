import type { CanvasRoute } from './routes';

export type OverviewNotice = {
  category: 'Music' | 'Lights' | 'Blinds';
  title: string;
  message: string;
  source?: string;
  route: CanvasRoute;
};

export type ReportOverviewNotice = (id: string, notice: OverviewNotice | null) => void;
