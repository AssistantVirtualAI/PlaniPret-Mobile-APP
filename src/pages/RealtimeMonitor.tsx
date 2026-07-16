import { AppLayout } from '@/components/layout/AppLayout';
import { RealtimeDashboard } from '@/components/dashboard/RealtimeDashboard';

const RealtimeMonitor = () => {
  return (
    <AppLayout>
      <div className="container mx-auto px-6 py-8">
        <RealtimeDashboard />
      </div>
    </AppLayout>
  );
};

export default RealtimeMonitor;
