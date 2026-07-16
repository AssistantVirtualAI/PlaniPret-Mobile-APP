import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calendar, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CalendarIntegrationCard } from '@/components/calendar/CalendarIntegrationCard';
import { AppointmentsList } from '@/components/calendar/AppointmentsList';
import { BookAppointmentModal } from '@/components/calendar/BookAppointmentModal';
import { useCalendarIntegration } from '@/hooks/useCalendarIntegration';
import { useTranslation } from '@/hooks/useTranslation';
import { AppLayout } from '@/components/layout/AppLayout';

const Appointments = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showBookModal, setShowBookModal] = useState(false);
  const { exchangeCode } = useCalendarIntegration();

  // Handle OAuth callback
  useEffect(() => {
    const callback = searchParams.get('callback');
    const code = searchParams.get('code');
    
    if (callback === 'google' && code) {
      exchangeCode.mutate(code);
      // Clean up URL
      setSearchParams({});
    }
  }, [searchParams]);

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calendar className="h-6 w-6" />
              {t('appointments.title')}
            </h1>
            <p className="text-muted-foreground">
              {t('appointments.description')}
            </p>
          </div>
          <Button onClick={() => setShowBookModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t('appointments.newAppointment')}
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <CalendarIntegrationCard />
          </div>
          <div className="lg:col-span-2">
            <AppointmentsList />
          </div>
        </div>

        <BookAppointmentModal
          open={showBookModal}
          onOpenChange={setShowBookModal}
        />
      </div>
    </AppLayout>
  );
};

export default Appointments;
