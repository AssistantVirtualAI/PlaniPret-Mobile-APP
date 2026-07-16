import { ClientProvider } from '@/context/ClientContext';
import { ClientLayout } from '@/components/client-portal/ClientLayout';

const ClientPortal = () => {
  return (
    <ClientProvider>
      <ClientLayout />
    </ClientProvider>
  );
};

export default ClientPortal;
