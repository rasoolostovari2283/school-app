'use client';
import useAuthStore from '../../../stores/authStore';
import TeacherSetupModal from '../../../components/teacher/TeacherSetupModal';
import { useRouter } from 'next/navigation';

export default function TeacherSetupPage() {
  const { user, setUser } = useAuthStore();
  const router = useRouter();

  const userSettings = (() => {
    if (!user?.settings) return {};
    try {
      return typeof user.settings === 'string' ? JSON.parse(user.settings) : user.settings;
    } catch (e) {
      return {};
    }
  })();

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '16px 8px' }}>
      <TeacherSetupModal
        isOpen={true}
        isStandalone={true}
        initialData={{
          school_name: userSettings?.school_name,
          schools: userSettings?.schools,
          taught_grades: userSettings?.taught_grades,
          subject: userSettings?.subject || user?.job_title,
        }}
        onSuccess={(updatedUser) => {
          if (setUser && updatedUser) {
            setUser(updatedUser);
          }
        }}
      />
    </div>
  );
}
