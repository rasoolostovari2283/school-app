'use client';
import { useState, useEffect } from 'react';
import useAuthStore from '../../../stores/authStore';
import api from '../../../lib/api';
import toast, { Toaster } from 'react-hot-toast';
import {
  HiOutlineTicket,
  HiOutlinePlus,
  HiOutlinePaperAirplane,
  HiOutlineXMark,
  HiOutlineClock,
  HiOutlineCheckCircle,
} from 'react-icons/hi2';
import styles from './tickets.module.css';

const DEPTS = {
  educational: 'امور آموزشی و اساتید',
  financial: 'امور مالی و شهریه',
  discipline: 'انضباطی و رفتاری',
  counseling: 'هدایت تحصیلی و مشاوره',
  principal: 'مدیریت مجتمع آموزشی',
};

const PRIORITIES = {
  low: { label: 'عادی', color: '#94a3b8' },
  normal: { label: 'متوسط', color: '#38bdf8' },
  high: { label: 'مهم', color: '#fbbf24' },
  urgent: { label: 'فوری / بحرانی', color: '#f87171' },
};

export default function TicketsPage() {
  const { user } = useAuthStore();
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(true);

  // New Ticket Modal State
  const [showModal, setShowModal] = useState(false);
  const [newDept, setNewDept] = useState('educational');
  const [newPriority, setNewPriority] = useState('normal');
  const [newSubject, setNewSubject] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const res = await api.get('/tickets');
      if (res.data?.success) {
        const list = res.data.data.tickets || [];
        setTickets(list);
        if (list.length > 0 && !selectedTicket) {
          loadTicketThread(list[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadTicketThread = async (id) => {
    try {
      const res = await api.get(`/tickets/${id}`);
      if (res.data?.success) {
        setSelectedTicket(res.data.data.ticket);
        setThreadMessages(res.data.data.messages || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!newSubject.trim() || !newMessage.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await api.post('/tickets', {
        department: newDept,
        priority: newPriority,
        subject: newSubject.trim(),
        message: newMessage.trim(),
      });

      if (res.data?.success) {
        toast.success(res.data.message || 'تیکت با موفقیت ارسال شد! 🎉');
        setShowModal(false);
        setNewSubject('');
        setNewMessage('');
        fetchTickets();
      }
    } catch (err) {
      toast.error('خطا در ثبت تیکت');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicket) return;

    try {
      const res = await api.post(`/tickets/${selectedTicket.id}/reply`, {
        message: replyText.trim(),
      });

      if (res.data?.success) {
        setReplyText('');
        loadTicketThread(selectedTicket.id);
        toast.success('پاسخ ارسال شد', { duration: 1000 });
      }
    } catch (err) {
      toast.error('خطا در ارسال پاسخ');
    }
  };

  return (
    <div className={styles.container}>
      <Toaster position="top-center" />

      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>سیستم تیکتینگ و مکاتبات اداری</h1>
          <p className={styles.subtitle}>
            ارتباط مستقیم و رسمی با دپارتمان‌های آموزشی، مالی، مشاوره، انضباطی و مدیریت مجتمع
          </p>
        </div>

        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowModal(true)}
          type="button"
        >
          <HiOutlinePlus />
          <span>ارسال تیکت و درخواست رسمی جدید</span>
        </button>
      </div>

      {/* Layout */}
      <div className={styles.layout}>
        {/* Ticket List Pane */}
        <div className={styles.ticketListPane}>
          <div className={styles.ticketListHeader}>
            لیست درخواست‌ها و تیکت‌ها ({tickets.length})
          </div>

          <div className={styles.ticketItemsWrapper}>
            {tickets.length > 0 ? (
              tickets.map((t) => (
                <div
                  key={t.id}
                  className={`${styles.ticketItem} ${
                    selectedTicket?.id === t.id ? styles.ticketItemActive : ''
                  }`}
                  onClick={() => loadTicketThread(t.id)}
                >
                  <div className={styles.ticketMetaRow}>
                    <span className={styles.ticketNum}>{t.ticket_number}</span>
                    <span style={{ color: PRIORITIES[t.priority]?.color, fontWeight: 700 }}>
                      ● {PRIORITIES[t.priority]?.label || t.priority}
                    </span>
                  </div>

                  <div className={styles.ticketSubject}>{t.subject}</div>

                  <div className={styles.ticketMetaRow} style={{ marginTop: '4px' }}>
                    <span>{DEPTS[t.department] || t.department}</span>
                    <span className={`badge ${t.status === 'resolved' ? 'badge-success' : 'badge-warning'}`}>
                      {t.status === 'resolved' ? 'پاسخ داده شده' : 'در دست بررسی'}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)' }}>
                تیکتی ثبت نشده است.
              </div>
            )}
          </div>
        </div>

        {/* Thread Message Pane */}
        <div className={styles.threadPane}>
          {selectedTicket ? (
            <>
              <div className={styles.threadHeader}>
                <div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span className="badge badge-primary">{selectedTicket.ticket_number}</span>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      بخش: {DEPTS[selectedTicket.department]}
                    </span>
                  </div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '6px' }}>
                    {selectedTicket.subject}
                  </h2>
                </div>

                <span className={`badge ${selectedTicket.status === 'resolved' ? 'badge-success' : 'badge-warning'}`}>
                  {selectedTicket.status === 'resolved' ? 'پاسخ داده شده' : 'در انتظار بررسی'}
                </span>
              </div>

              {/* Messages Thread */}
              <div className={styles.threadMessages}>
                {threadMessages.map((msg) => {
                  const isMine = msg.sender_id === user?.id;
                  return (
                    <div
                      key={msg.id}
                      className={`${styles.messageBubble} ${
                        isMine ? styles.bubbleMine : styles.bubbleOther
                      }`}
                    >
                      <div className={styles.bubbleMeta}>
                        {isMine ? 'شما' : `${msg.sender_name || 'پشتیبانی'} (${msg.sender_role === 'teacher' ? 'مسئول مربوطه' : 'کاربر'})`}
                      </div>
                      <div>{msg.message}</div>
                    </div>
                  );
                })}
              </div>

              {/* Reply Form */}
              <form onSubmit={handleSendReply} className={styles.replyBar}>
                <input
                  type="text"
                  className="input"
                  placeholder="پاسخ خود را اینجا بنویسید..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                />
                <button type="submit" className="btn btn-primary" disabled={!replyText.trim()}>
                  <HiOutlinePaperAirplane style={{ transform: 'rotate(180deg)' }} />
                  <span>ارسال</span>
                </button>
              </form>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)' }}>
              یک تیکت را برای مشاهده سابقه گفتگو انتخاب کنید.
            </div>
          )}
        </div>
      </div>

      {/* ── Modal: Open New Ticket ── */}
      {showModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius-2xl)', maxWidth: '480px', width: '100%', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontWeight: 800 }}>ارسال تیکت و درخواست رسمی</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '1.25rem' }}>
                <HiOutlineXMark />
              </button>
            </div>

            <form onSubmit={handleCreateTicket} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="input-group">
                  <label className="input-label" htmlFor="tck_dept">دپارتمان مربوطه</label>
                  <select
                    id="tck_dept"
                    className="input"
                    value={newDept}
                    onChange={(e) => setNewDept(e.target.value)}
                  >
                    <option value="educational">امور آموزشی و اساتید</option>
                    <option value="financial">امور مالی و شهریه</option>
                    <option value="discipline">انضباطی و پرورشی</option>
                    <option value="counseling">هدایت تحصیلی و مشاوره</option>
                    <option value="principal">مدیریت مجتمع</option>
                  </select>
                </div>

                <div className="input-group">
                  <label className="input-label" htmlFor="tck_priority">درجه اولویت</label>
                  <select
                    id="tck_priority"
                    className="input"
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                  >
                    <option value="normal">عادی</option>
                    <option value="high">مهم</option>
                    <option value="urgent">فوری / بحرانی</option>
                  </select>
                </div>
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="tck_subject">موضوع درخواست</label>
                <input
                  id="tck_subject"
                  type="text"
                  className="input"
                  placeholder="مثلاً: درخواست بازنگری نمره آزمون فیزیک"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  required
                />
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="tck_msg">شرح کامل پیام یا درخواست</label>
                <textarea
                  id="tck_msg"
                  rows={4}
                  className="input"
                  placeholder="شرح جزئیات..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  انصراف
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'در حال ثبت...' : 'ارسال رسمی تیکت'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
