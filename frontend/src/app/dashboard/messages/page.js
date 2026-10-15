'use client';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import useAuthStore from '../../../stores/authStore';
import api from '../../../lib/api';
import toast from 'react-hot-toast';
import {
  HiOutlineChatBubbleLeftRight,
  HiOutlinePaperAirplane,
  HiOutlineShieldCheck,
  HiOutlineMagnifyingGlass,
  HiOutlineCheck,
  HiOutlineUserGroup,
  HiOutlineIdentification,
  HiOutlinePhone,
  HiOutlineVideoCamera,
  HiOutlinePlus,
  HiOutlinePaperClip,
  HiOutlineXMark,
  HiOutlineDocumentArrowDown,
  HiOutlineMicrophone,
  HiOutlineStop,
  HiOutlineTrash,
  HiOutlinePencilSquare,
  HiOutlineLink,
  HiOutlineUserPlus,
  HiOutlineClipboardDocument,
  HiOutlineClipboardDocumentCheck,
  HiOutlineArrowRightOnRectangle,
} from 'react-icons/hi2';
import CallModal from '../../../components/communication/CallModal';
import styles from './messages.module.css';

// Helper to guarantee attachments is always an array
const parseAttachments = (attachments) => {
  if (!attachments) return [];
  if (Array.isArray(attachments)) return attachments;
  if (typeof attachments === 'string') {
    try {
      const parsed = JSON.parse(attachments);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  return [];
};

export default function MessagesPage() {
  const { user } = useAuthStore();
  const searchParams = useSearchParams();
  const targetUserId = searchParams.get('user') || searchParams.get('partner');

  // Active view tab: 'chats' | 'groups' | 'directory'
  const [activeTab, setActiveTab] = useState('chats');

  // Chat Sub-Filter: 'all' | 'students' | 'parents' | 'staff' (تفکیک دانش‌آموزان و اولیا)
  const [chatRoleFilter, setChatRoleFilter] = useState('all');

  // Role Badge Helper
  const getRoleBadge = (role) => {
    if (role === 'student') {
      return { label: 'دانش‌آموز', icon: '🎓', className: styles.roleBadgeStudent };
    }
    if (role === 'parent') {
      return { label: 'ولی دانش‌آموز', icon: '👨‍👩‍👧', className: styles.roleBadgeParent };
    }
    return { label: 'کادر مدرسه', icon: '👨‍🏫', className: styles.roleBadgeTeacher };
  };

  // 1-on-1 Conversations
  const [conversations, setConversations] = useState([]);
  const [activePartner, setActivePartner] = useState(null);
  const [messages, setMessages] = useState([]);

  // Groups
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [groupMessages, setGroupMessages] = useState([]);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupForm, setNewGroupForm] = useState({
    name: '',
    description: '',
    category: 'council',
    member_ids: [],
  });

  // Group Member Management & Invite Links Modals
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showInviteLinkModal, setShowInviteLinkModal] = useState(false);
  const [showJoinGroupModal, setShowJoinGroupModal] = useState(false);
  const [showGroupMembersModal, setShowGroupMembersModal] = useState(false);
  const [groupMembersList, setGroupMembersList] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Add Member by ID state
  const [memberIdentifierInput, setMemberIdentifierInput] = useState('');
  const [searchMemberResults, setSearchMemberResults] = useState([]);
  const [searchingMember, setSearchingMember] = useState(false);
  const [addingMember, setAddingMember] = useState(false);

  // Group Invite Link copy state
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Join by Link state
  const [joinLinkInput, setJoinLinkInput] = useState('');
  const [joiningGroup, setJoiningGroup] = useState(false);

  // In Create Group Modal: Added members list
  const [createGroupMembers, setCreateGroupMembers] = useState([]);
  const [createGroupMemberInput, setCreateGroupMemberInput] = useState('');
  const [createGroupSearchResults, setCreateGroupSearchResults] = useState([]);
  const [searchingCreateMember, setSearchingCreateMember] = useState(false);

  // Directory & School Database Integration
  const [directory, setDirectory] = useState({ staff: [], students: [], parents: [], all: [] });
  const [dirSearchQuery, setDirSearchQuery] = useState('');
  const [dirRoleFilter, setDirRoleFilter] = useState('all');
  const [dirGradeFilter, setDirGradeFilter] = useState('all');
  const [schoolInfo, setSchoolInfo] = useState({
    name: 'مجتمع آموزشی هوشمند علامه حلی',
    code: 'SCH-4821',
  });

  // Helper to extract grade string
  const extractGrade = (deptOrGrade) => {
    if (!deptOrGrade) return null;
    const str = String(deptOrGrade);
    if (str.includes('دوازدهم') || str.includes('12')) return 'پایه دوازدهم';
    if (str.includes('یازدهم') || str.includes('11')) return 'پایه یازدهم';
    if (str.includes('دهم') || str.includes('10')) return 'پایه دهم';
    if (str.includes('نهم') || str.includes('9')) return 'پایه نهم';
    if (str.includes('هشتم') || str.includes('8')) return 'پایه هشتم';
    if (str.includes('هفتم') || str.includes('7')) return 'پایه هفتم';
    return null;
  };

  const myUserGrade = extractGrade(user?.grade) || extractGrade(user?.department) || 'پایه دهم';
  const myChildGrade = extractGrade(user?.student_department) || extractGrade(user?.student_grade) || extractGrade(user?.grade) || extractGrade(user?.department) || 'پایه دهم';

  // Input & attachments
  const [newMessageText, setNewMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Edit & Delete state
  const [editingMessage, setEditingMessage] = useState(null); // { id, content, isGroup, groupId }
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    message: null,
    isGroup: false,
    groupId: null,
  });

  // Calling Modal state
  const [callModal, setCallModal] = useState({
    isOpen: false,
    callType: 'video',
    partner: null,
    isGroup: false,
  });

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Voice Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  useEffect(() => {
    fetchConversations();
    fetchGroups();
    fetchDirectory();
  }, []);

  useEffect(() => {
    if (targetUserId) {
      const match = conversations.find((c) => c.id === targetUserId || c.user?.id === targetUserId);
      if (match) {
        selectConversation(match.user);
      } else if (directory?.all?.length > 0) {
        const found = directory.all.find((u) => u.id === targetUserId);
        if (found) selectConversation(found);
      }
    } else if (conversations.length > 0 && !activePartner && !activeGroup) {
      selectConversation(conversations[0].user);
    }
  }, [conversations, targetUserId, directory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, groupMessages]);

  const fetchConversations = async () => {
    try {
      const res = await api.get('/messages/conversations');
      setConversations(res.data.data.conversations || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await api.get('/messages/groups');
      setGroups(res.data.data.groups || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDirectory = async () => {
    let currentCode = user?.school_code || 'SCH-4821';
    let currentName = user?.school_name || 'مجتمع آموزشی هوشمند علامه حلی';

    try {
      const savedSchools = JSON.parse(localStorage.getItem('registered_schools') || '[]');
      if (savedSchools.length > 0) {
        const matched = savedSchools.find((s) => s.school_code === currentCode) || savedSchools[0];
        if (matched) {
          currentCode = matched.school_code;
          currentName = matched.school_name;
        }
      }
    } catch (e) {}

    setSchoolInfo({ code: currentCode, name: currentName });

    // 1. Fetch Backend Directory
    let backendData = { staff: [], students: [], parents: [], all: [] };
    try {
      const res = await api.get('/messages/directory');
      if (res.data?.data) {
        backendData = res.data.data;
      }
    } catch (err) {
      console.error('Error fetching backend directory:', err);
    }

    // 2. Load School Teachers from School Database
    let schoolTeachers = [];
    try {
      const savedTch =
        localStorage.getItem(`mgmt_teachers_${currentCode}`) ||
        localStorage.getItem('school_teachers_database');
      if (savedTch) schoolTeachers = JSON.parse(savedTch);
    } catch (e) {}

    if (schoolTeachers.length === 0) {
      schoolTeachers = [
        { id: 'tch-101', name: 'مهندس حسین میرزایی', code: 'TCH-101', subject: 'ریاضی و هندسه', phone: '09121110002', personnel_code: 'EMP-98402', grades: ['پایه دهم', 'پایه یازدهم'] },
        { id: 'tch-102', name: 'دکتر فاطمه صادقی', code: 'TCH-102', subject: 'زیست‌شناسی و ژنتیک', phone: '09121110003', personnel_code: 'EMP-98403', grades: ['پایه دهم', 'پایه دوازدهم'] },
        { id: 'tch-103', name: 'استاد مسعود اکبری', code: 'TCH-103', subject: 'فیزیک', phone: '09121110004', personnel_code: 'EMP-98404', grades: ['پایه یازدهم', 'پایه دوازدهم'] },
        { id: 'tch-104', name: 'سرکار خانم مهندس جلالی', code: 'TCH-104', subject: 'شیمی', phone: '09121110005', personnel_code: 'EMP-98405', grades: ['پایه دهم', 'پایه یازدهم'] },
        { id: 'tch-105', name: 'دکتر مهدی رحمانی', code: 'TCH-105', subject: 'مشاوره و هدایت تحصیلی', phone: '09121110006', personnel_code: 'EMP-98406', grades: ['پایه دهم', 'پایه یازدهم', 'پایه دوازدهم'] },
      ];
    }

    // 3. Load School Students from School Database
    let schoolStudents = [];
    try {
      const savedStd = localStorage.getItem(`mgmt_students_${currentCode}`);
      if (savedStd) schoolStudents = JSON.parse(savedStd);
    } catch (e) {}

    if (schoolStudents.length === 0) {
      schoolStudents = [
        { id: 'std-1', name: 'محمد پارسا رادمنش', code: 'STD-1001', grade: 'پایه دهم', class_name: 'کلاس ۱۰۱ - ریاضی و حسابان', parent_phone: '09123456701' },
        { id: 'std-2', name: 'علیرضا اسدی', code: 'STD-1002', grade: 'پایه دهم', class_name: 'کلاس ۱۰۲ - شیمی پایه', parent_phone: '09123456702' },
        { id: 'std-3', name: 'سینا محمدی', code: 'STD-1003', grade: 'پایه دهم', class_name: 'کلاس ۱۰۱ - ریاضی و حسابان', parent_phone: '09123456703' },
        { id: 'std-4', name: 'امیررضا صادقی', code: 'STD-2001', grade: 'پایه یازدهم', class_name: 'کلاس ۲۰۱ - فیزیک تجربی', parent_phone: '09123456704' },
        { id: 'std-5', name: 'مهدی کریمی', code: 'STD-2002', grade: 'پایه یازدهم', class_name: 'کلاس ۲۰۱ - فیزیک تجربی', parent_phone: '09123456705' },
        { id: 'std-6', name: 'علی‌اکبر نجفی', code: 'STD-3001', grade: 'پایه دوازدهم', class_name: 'کلاس ۳۰۱ - کنکور پیشرفته', parent_phone: '09123456706' },
      ];
    }

    // 4. Merge Teachers Map (School Account + Backend Staff)
    const teachersMap = new Map();
    (backendData.staff || []).forEach((st) => {
      teachersMap.set(st.id, {
        ...st,
        role: 'teacher',
        school_code: currentCode,
      });
    });

    schoolTeachers.forEach((tch) => {
      let existingKey = null;
      for (const [key, val] of teachersMap.entries()) {
        if (
          (tch.personnel_code && val.personnel_code && tch.personnel_code === val.personnel_code) ||
          (tch.name && val.display_name && tch.name.trim() === val.display_name.trim()) ||
          key === tch.id
        ) {
          existingKey = key;
          break;
        }
      }

      if (existingKey) {
        const prev = teachersMap.get(existingKey);
        teachersMap.set(existingKey, {
          ...prev,
          subject: tch.subject || prev.subject,
          job_title: tch.subject ? `دبیر ${tch.subject}` : (prev.job_title || 'دبیر مدرسه'),
          grades: tch.grades || prev.grades || ['پایه دهم', 'پایه یازدهم'],
          personnel_code: tch.personnel_code || tch.code || prev.personnel_code,
          department: tch.grades ? tch.grades.join('، ') : prev.department,
          phone: tch.phone || prev.phone,
          school_code: currentCode,
        });
      } else {
        teachersMap.set(tch.id, {
          id: tch.id,
          display_name: tch.name,
          role: 'teacher',
          job_title: tch.subject ? `دبیر ${tch.subject}` : 'دبیر مدرسه',
          subject: tch.subject,
          personnel_code: tch.personnel_code || tch.code,
          code: tch.code,
          grades: tch.grades || ['پایه دهم', 'پایه یازدهم'],
          department: tch.grades ? tch.grades.join('، ') : 'دپارتمان آموزشی',
          phone: tch.phone,
          school_code: currentCode,
          is_school_registered: true,
        });
      }
    });

    const allTeachers = Array.from(teachersMap.values());

    // 5. Merge Students Map (School Account + Backend Students)
    const studentsMap = new Map();
    (backendData.students || []).forEach((st) => {
      const g = st.grade || extractGrade(st.department) || 'پایه دهم';
      studentsMap.set(st.id, {
        ...st,
        role: 'student',
        grade: g,
        school_code: currentCode,
      });
    });

    schoolStudents.forEach((std) => {
      let existingKey = null;
      for (const [key, val] of studentsMap.entries()) {
        if (
          (std.code && val.student_code && std.code === val.student_code) ||
          (std.name && val.display_name && std.name.trim() === val.display_name.trim()) ||
          key === std.id
        ) {
          existingKey = key;
          break;
        }
      }

      const stGrade = std.grade || extractGrade(std.class_name) || 'پایه دهم';
      if (existingKey) {
        const prev = studentsMap.get(existingKey);
        studentsMap.set(existingKey, {
          ...prev,
          grade: stGrade,
          class_name: std.class_name || prev.class_name,
          department: `${stGrade} • ${std.class_name || 'کلاس درس'}`,
          student_code: std.code || prev.student_code,
          parent_phone: std.parent_phone || prev.parent_phone,
          school_code: currentCode,
        });
      } else {
        studentsMap.set(std.id, {
          id: std.id,
          display_name: std.name,
          role: 'student',
          job_title: 'دانش‌آموز',
          grade: stGrade,
          class_name: std.class_name,
          department: `${stGrade} • ${std.class_name || 'کلاس درس'}`,
          student_code: std.code,
          code: std.code,
          parent_phone: std.parent_phone,
          school_code: currentCode,
          is_school_registered: true,
        });
      }
    });

    const rawStudents = Array.from(studentsMap.values());

    // 6. Merge Parents
    const rawParents = (backendData.parents || []).map((p) => {
      const g = p.grade || p.student_grade || extractGrade(p.student_department) || 'پایه دهم';
      return {
        ...p,
        role: 'parent',
        grade: g,
        student_grade: g,
        school_code: currentCode,
      };
    });

    // 7. Apply Strict Role-Based Grade Isolation
    let filteredStaff = allTeachers;
    let filteredStudents = rawStudents;
    let filteredParents = rawParents;

    if (user?.role === 'student') {
      // Student sees ALL teachers of the school, but ONLY peers in their SAME GRADE
      filteredStaff = allTeachers;
      filteredStudents = rawStudents.filter((s) => s.grade === myUserGrade || s.department?.includes(myUserGrade));
      filteredParents = rawParents.filter((p) => p.grade === myUserGrade || p.student_grade === myUserGrade);
    } else if (user?.role === 'parent') {
      // Parent sees ALL teachers of the school, but ONLY students and parents of their child's grade
      filteredStaff = allTeachers;
      filteredStudents = rawStudents.filter((s) => s.grade === myChildGrade || s.department?.includes(myChildGrade));
      filteredParents = rawParents.filter((p) => p.grade === myChildGrade || p.student_grade === myChildGrade);
    }

    const allCombined = [...filteredStaff, ...filteredStudents, ...filteredParents];

    setDirectory({
      staff: filteredStaff,
      students: filteredStudents,
      parents: filteredParents,
      all: allCombined,
      allGradesStudents: rawStudents,
      allGradesParents: rawParents,
    });
  };

  const selectConversation = async (partnerUser) => {
    if (!partnerUser) return;
    setActiveGroup(null);
    setActivePartner(partnerUser);

    // Retrieve cached messages if available
    const localChatKey = `school_chat_${user?.id}_${partnerUser.id}`;
    let cached = [];
    try {
      cached = JSON.parse(localStorage.getItem(localChatKey) || '[]');
    } catch (e) {}

    try {
      const res = await api.get(`/messages/conversations/${partnerUser.id}`);
      const serverMsgs = res.data?.data?.messages || [];
      if (serverMsgs.length > 0) {
        setMessages(serverMsgs);
      } else {
        setMessages(cached);
      }
    } catch (err) {
      console.warn('Fallback to local chat for partner:', partnerUser.id);
      setMessages(cached);
    }
  };

  const selectGroup = async (group) => {
    if (!group) return;
    setActivePartner(null);
    setActiveGroup(group);
    try {
      const res = await api.get(`/messages/groups/${group.id}/messages`);
      setGroupMessages(res.data.data.messages || []);
    } catch (err) {
      console.error(err);
      toast.error('خطا در بارگذاری پیام‌های گروه');
    }
  };

  // Group Member Management & Invite Links Handlers
  const fetchGroupMembers = async (groupId) => {
    setLoadingMembers(true);
    try {
      const res = await api.get(`/messages/groups/${groupId}/members`);
      setGroupMembersList(res.data.data?.members || []);
    } catch (err) {
      console.error(err);
      toast.error('خطا در بارگذاری اعضای گروه');
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleSearchUsers = async (query, target = 'active') => {
    if (!query || query.trim().length < 2) {
      if (target === 'active') setSearchMemberResults([]);
      else setCreateGroupSearchResults([]);
      return;
    }

    if (target === 'active') setSearchingMember(true);
    else setSearchingCreateMember(true);

    try {
      const res = await api.get(`/messages/users/search?q=${encodeURIComponent(query.trim())}`);
      const list = res.data.data?.users || [];
      if (target === 'active') setSearchMemberResults(list);
      else setCreateGroupSearchResults(list);
    } catch (err) {
      console.error(err);
    } finally {
      if (target === 'active') setSearchingMember(false);
      else setSearchingCreateMember(false);
    }
  };

  const handleAddMemberByIdentifier = async (identToUse) => {
    const ident = (identToUse || memberIdentifierInput).trim();
    if (!ident) {
      toast.error('لطفاً آیدی (@username)، کد دانش‌آموزی، کد پرسنلی یا شماره تماس را وارد کنید');
      return;
    }
    if (!activeGroup) return;

    setAddingMember(true);
    try {
      const res = await api.post(`/messages/groups/${activeGroup.id}/members`, {
        identifier: ident,
      });
      toast.success(res.data.message || 'عضو جدید با موفقیت به گروه افزوده شد 🎉');
      setMemberIdentifierInput('');
      setSearchMemberResults([]);
      const newCount = res.data.data?.members_count || (activeGroup.members_count || 1) + 1;
      setActiveGroup((prev) => ({ ...prev, members_count: newCount }));
      setGroups((prev) =>
        prev.map((g) => (g.id === activeGroup.id ? { ...g, members_count: newCount } : g))
      );
      fetchGroupMembers(activeGroup.id);
      selectGroup(activeGroup);
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در افزودن عضو به گروه');
    } finally {
      setAddingMember(false);
    }
  };

  const getFullInviteLink = (group) => {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;
    const code = group?.invite_code || group?.id;
    return `${origin}/dashboard/messages?joinGroup=${code}`;
  };

  const handleCopyInviteLink = (group) => {
    const link = getFullInviteLink(group || activeGroup);
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    toast.success('لینک دعوت گروه کپی شد 📋');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyInviteCode = (code) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast.success(`کد دعوت «${code}» کپی شد 📋`);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleJoinGroupByLink = async (codeToJoin) => {
    const code = (codeToJoin || joinLinkInput).trim();
    if (!code) {
      toast.error('لطفاً لینک یا کد دعوت گروه را وارد کنید');
      return;
    }

    setJoiningGroup(true);
    try {
      const res = await api.post('/messages/groups/join', { invite_code: code });
      toast.success(res.data.message || 'با موفقیت به گروه پیوستید 🎉');
      setJoinLinkInput('');
      setShowJoinGroupModal(false);
      await fetchGroups();
      if (res.data.data?.group) {
        selectGroup(res.data.data.group);
        setActiveTab('groups');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در پیوستن به گروه');
    } finally {
      setJoiningGroup(false);
    }
  };

  const handleAddMemberToCreateList = (userObj) => {
    if (!userObj) return;
    if (createGroupMembers.some((m) => m.id === userObj.id)) {
      toast.error('این کاربر قبلاً به لیست اضافه شده است');
      return;
    }
    setCreateGroupMembers((prev) => [...prev, userObj]);
    setCreateGroupMemberInput('');
    setCreateGroupSearchResults([]);
    toast.success(`«${userObj.display_name}» به لیست اعضا اضافه شد 👍`);
  };

  const handleRemoveMemberFromCreateList = (userId) => {
    setCreateGroupMembers((prev) => prev.filter((m) => m.id !== userId));
  };

  // Join group from URL parameter on initial load
  useEffect(() => {
    const joinCode = searchParams.get('joinGroup');
    if (joinCode) {
      handleJoinGroupByLink(joinCode);
    }
  }, [searchParams]);

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingFile(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      const res = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const uploaded = res.data.data.files || [res.data.data.file];
      setAttachedFiles((prev) => [...prev, ...uploaded]);
      toast.success(`${uploaded.length} فایل پیوست شد`);
    } catch (err) {
      toast.error('خطا در بارگذاری فایل');
    } finally {
      setUploadingFile(false);
    }
  };

  const removeAttachment = (index) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Voice Recording Handlers
  const startRecording = async () => {
    try {
      if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
        toast.error('مرورگر شما از ضبط صدا پشتیبانی نمی‌کند');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          mimeType = 'audio/ogg;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        }
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordingDuration(0);

      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      toast('در حال ضبط صدا... لطفاً صحبت کنید 🎙️', { icon: '🔴' });
    } catch (err) {
      console.error('Microphone error:', err);
      toast.error('دسترسی به میکروفون داده نشد یا میکروفون در دسترس نیست');
    }
  };

  const cancelRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
      } catch (e) {}
    }
    setIsRecording(false);
    setRecordingDuration(0);
    audioChunksRef.current = [];
    toast('ضبط ویس لغو شد ❌');
  };

  const stopAndSendRecording = async () => {
    if (!mediaRecorderRef.current || !isRecording) return;

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }

    const duration = recordingDuration;
    setIsRecording(false);
    setIsUploadingVoice(true);

    const recorder = mediaRecorderRef.current;

    recorder.onstop = async () => {
      try {
        recorder.stream?.getTracks().forEach((t) => t.stop());

        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });

        if (audioBlob.size < 500 && duration < 1) {
          toast.error('ویس بسیار کوتاه بود و ارسال نشد');
          setIsUploadingVoice(false);
          return;
        }

        const ext = recorder.mimeType?.includes('mp4') ? 'm4a' : recorder.mimeType?.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([audioBlob], `voice_${Date.now()}.${ext}`, {
          type: recorder.mimeType || 'audio/webm',
        });

        const formData = new FormData();
        formData.append('file', file);

        const uploadRes = await api.post('/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        const uploadedFile = uploadRes.data.data.file || uploadRes.data.data.files[0];
        uploadedFile.is_voice = true;
        uploadedFile.duration = duration;

        if (activeGroup) {
          const res = await api.post(`/messages/groups/${activeGroup.id}/messages`, {
            content: '🎙️ پیام صوتی',
            attachments: [uploadedFile],
          });
          const serverMsg = res.data.data.message;
          if (serverMsg) {
            serverMsg.attachments = parseAttachments(serverMsg.attachments);
          }
          setGroupMessages((prev) => [...prev, serverMsg]);
          fetchGroups();
          toast.success('ویس با موفقیت به گروه ارسال شد 🎙️');
        } else if (activePartner) {
          const optimisticMsg = {
            id: 'temp-' + Date.now(),
            sender_id: user?.id,
            receiver_id: activePartner.id,
            content: '🎙️ پیام صوتی',
            attachments: [uploadedFile],
            sent_at: new Date().toISOString(),
            is_read: false,
          };
          setMessages((prev) => [...prev, optimisticMsg]);

          const res = await api.post('/messages', {
            receiver_id: activePartner.id,
            content: '🎙️ پیام صوتی',
            attachments: [uploadedFile],
          });
          const serverMsg = res.data.data.message;
          if (serverMsg) {
            serverMsg.attachments = parseAttachments(serverMsg.attachments);
          }
          setMessages((prev) => prev.map((m) => (m.id === optimisticMsg.id ? serverMsg : m)));
          fetchConversations();
          toast.success('ویس با موفقیت ارسال شد 🎙️');
        }
      } catch (err) {
        console.error('Error uploading/sending voice:', err);
        toast.error('خطا در بارگذاری یا ارسال ویس');
      } finally {
        setIsUploadingVoice(false);
        setRecordingDuration(0);
        audioChunksRef.current = [];
      }
    };

    recorder.stop();
  };

  const formatDuration = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if ((!newMessageText.trim() && attachedFiles.length === 0) || sending) return;

    const textToSend = newMessageText.trim();
    const filesToSend = [...attachedFiles];

    // Handle Edit Mode
    if (editingMessage) {
      setSending(true);
      try {
        if (editingMessage.isGroup) {
          const res = await api.put(
            `/messages/groups/${editingMessage.groupId}/messages/${editingMessage.id}`,
            { content: textToSend }
          );
          const updated = res.data.data.message;
          setGroupMessages((prev) =>
            prev.map((m) =>
              m.id === updated.id
                ? { ...m, ...updated, is_edited: true, content: textToSend }
                : m
            )
          );
        } else {
          const res = await api.put(`/messages/${editingMessage.id}`, {
            content: textToSend,
          });
          const updated = res.data.data.message;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updated.id
                ? { ...m, ...updated, is_edited: true, content: textToSend }
                : m
            )
          );
        }
        toast.success('پیام با موفقیت ویرایش شد ✏️');
        setEditingMessage(null);
        setNewMessageText('');
      } catch (err) {
        toast.error('خطا در ویرایش پیام');
      } finally {
        setSending(false);
      }
      return;
    }

    setNewMessageText('');
    setAttachedFiles([]);
    setSending(true);

    if (activeGroup) {
      // Send group message
      try {
        const res = await api.post(`/messages/groups/${activeGroup.id}/messages`, {
          content: textToSend,
          attachments: filesToSend,
        });
        const serverMsg = res.data.data.message;
        if (serverMsg) {
          serverMsg.attachments = parseAttachments(serverMsg.attachments);
        }
        setGroupMessages((prev) => [...prev, serverMsg]);
        fetchGroups();
      } catch (err) {
        toast.error('خطا در ارسال پیام به گروه');
      } finally {
        setSending(false);
      }
      return;
    }

    if (activePartner) {
      // Send 1-on-1 message
      const optimisticMsg = {
        id: 'msg-' + Date.now(),
        sender_id: user?.id,
        receiver_id: activePartner.id,
        content: textToSend,
        attachments: filesToSend,
        sent_at: new Date().toISOString(),
        is_read: false,
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      // Cache locally
      const localChatKey = `school_chat_${user?.id}_${activePartner.id}`;
      try {
        const cached = JSON.parse(localStorage.getItem(localChatKey) || '[]');
        localStorage.setItem(localChatKey, JSON.stringify([...cached, optimisticMsg]));
      } catch (e) {}

      // Update conversations sidebar list so contact appears at top
      setConversations((prev) => {
        const existingIdx = prev.findIndex((c) => c.user?.id === activePartner.id || c.id === activePartner.id);
        const item = {
          id: activePartner.id,
          user: activePartner,
          last_message: optimisticMsg,
          unread_count: 0,
        };
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated.splice(existingIdx, 1);
          return [item, ...updated];
        }
        return [item, ...prev];
      });

      try {
        const res = await api.post('/messages', {
          receiver_id: activePartner.id,
          content: textToSend,
          attachments: filesToSend,
        });
        const serverMsg = res.data?.data?.message;
        if (serverMsg) {
          serverMsg.attachments = parseAttachments(serverMsg.attachments);
          setMessages((prev) =>
            prev.map((m) => (m.id === optimisticMsg.id ? serverMsg : m))
          );
        }
        fetchConversations();
      } catch (err) {
        console.warn('API message sync note (retained in local cache):', err);
      } finally {
        setSending(false);
      }
    }
  };

  const startEditMessage = (msg, isGroup = false, groupId = null) => {
    setEditingMessage({
      id: msg.id,
      content: msg.content || '',
      isGroup,
      groupId,
    });
    setNewMessageText(msg.content || '');
  };

  const cancelEditing = () => {
    setEditingMessage(null);
    setNewMessageText('');
  };

  const handleDeleteMessage = async () => {
    if (!deleteModal.message) return;
    const { message, isGroup, groupId } = deleteModal;
    try {
      if (isGroup) {
        await api.delete(`/messages/groups/${groupId}/messages/${message.id}`);
        setGroupMessages((prev) => prev.filter((m) => m.id !== message.id));
      } else {
        await api.delete(`/messages/${message.id}`);
        setMessages((prev) => prev.filter((m) => m.id !== message.id));
      }
      toast.success('پیام با موفقیت حذف شد 🗑️');
      setDeleteModal({ isOpen: false, message: null, isGroup: false, groupId: null });
    } catch (err) {
      toast.error('خطا در حذف پیام');
    }
  };

  const handleStartDirectChat = (contactUser) => {
    setActiveTab('chats');
    selectConversation(contactUser);
  };

  const handleTriggerCall = (target, type = 'video', isGrp = false) => {
    setCallModal({
      isOpen: true,
      callType: type,
      partner: target,
      isGroup: isGrp,
    });
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupForm.name.trim()) {
      toast.error('لطفاً نام گروه را وارد کنید');
      return;
    }

    try {
      const memberIds = createGroupMembers.map((m) => m.id);
      const res = await api.post('/messages/groups', {
        ...newGroupForm,
        member_ids: memberIds,
      });
      const createdGrp = res.data.data?.group;
      toast.success('گروه با موفقیت ساخته شد 🎉');
      setShowCreateGroupModal(false);
      setNewGroupForm({ name: '', description: '', category: 'council', member_ids: [] });
      setCreateGroupMembers([]);
      setCreateGroupMemberInput('');
      setCreateGroupSearchResults([]);
      await fetchGroups();
      if (createdGrp) {
        selectGroup(createdGrp);
        setActiveTab('groups');
        // Prompt with the invite link modal so they can share it immediately!
        setShowInviteLinkModal(true);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ایجاد گروه');
    }
  };

  // Filter 1-on-1 conversations by search and role (including username / @handle)
  const allFilteredConversations = conversations.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase().trim();
    const qClean = q.replace(/^@/, '');
    return (
      c.user.display_name?.toLowerCase().includes(q) ||
      (c.user.username && c.user.username.toLowerCase().includes(qClean)) ||
      c.user.personnel_code?.toLowerCase().includes(q) ||
      c.user.student_code?.toLowerCase().includes(q)
    );
  });

  const studentConversations = allFilteredConversations.filter((c) => c.user.role === 'student');
  const parentConversations = allFilteredConversations.filter((c) => c.user.role === 'parent');
  const staffConversations = allFilteredConversations.filter(
    (c) => c.user.role !== 'student' && c.user.role !== 'parent'
  );

  const displayedConversations = (() => {
    if (chatRoleFilter === 'students') return studentConversations;
    if (chatRoleFilter === 'parents') return parentConversations;
    if (chatRoleFilter === 'staff') return staffConversations;
    return allFilteredConversations;
  })();

  const renderConversationItem = (item) => {
    const isActive = activePartner?.id === item.user.id;
    const badge = getRoleBadge(item.user.role);
    return (
      <div
        key={item.user.id}
        className={`${styles.contactItem} ${isActive ? styles.contactItemActive : ''}`}
        onClick={() => selectConversation(item.user)}
      >
        <div
          className="avatar"
          style={{
            width: '40px',
            height: '40px',
            fontSize: '0.9375rem',
            background: item.user.role === 'student' ? '#059669' : (item.user.role === 'parent' ? '#d97706' : '#4f46e5'),
            color: 'white',
          }}
        >
          {item.user.display_name?.charAt(0)}
        </div>

        <div className={styles.contactDetails}>
          <div className={styles.contactNameRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flexWrap: 'wrap' }}>
              <span className={styles.contactName}>{item.user.display_name}</span>
              <span className={badge.className}>
                {badge.icon} {badge.label}
              </span>
            </div>
            {item.user.username && (
              <span
                className={styles.usernameBadge}
                title="آیدی اختصاصی ورودی (کلیک جهت کپی)"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard?.writeText(`@${item.user.username}`);
                  toast.success(`آیدی @${item.user.username} کپی شد 📋`);
                }}
              >
                @{item.user.username}
              </span>
            )}
            {item.user.role === 'teacher' && item.user.subject && (
              <span className={styles.teacherSubjectBadge}>
                دبیر {item.user.subject}
              </span>
            )}
            {item.user.role === 'student' && item.user.grade && (
              <span className={styles.studentGradeBadge}>
                {item.user.grade}
              </span>
            )}
            {item.user.role === 'parent' && item.user.student_name && (
              <span className={styles.contactCodePill} style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fcd34d' }}>
                فرزند: {item.user.student_name}
              </span>
            )}
            {item.user.personnel_code && (
              <span className={styles.contactCodePill}>کد: {item.user.personnel_code}</span>
            )}
            {item.user.student_code && (
              <span className={styles.contactCodePill}>کد: {item.user.student_code}</span>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
            <span className={styles.lastMsgPreview}>
              {item.last_message ? item.last_message.content : 'شروع گفتگوی خصوصی...'}
            </span>
            {item.unread_count > 0 && (
              <span className={styles.unreadBadge}>{item.unread_count}</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Filter Directory (including username / @handle / grades / subject)
  const filteredDirectoryUsers = (directory.all || []).filter((u) => {
    if (dirRoleFilter !== 'all' && u.role !== dirRoleFilter) return false;

    // For teachers / admin / manager: apply grade filter if chosen
    if ((user?.role === 'teacher' || user?.role === 'admin' || user?.role === 'manager') && dirGradeFilter !== 'all') {
      if (u.role === 'student' && u.grade !== dirGradeFilter && !u.department?.includes(dirGradeFilter)) {
        return false;
      }
      if (u.role === 'parent' && u.grade !== dirGradeFilter && u.student_grade !== dirGradeFilter) {
        return false;
      }
    }

    if (!dirSearchQuery) return true;
    const q = dirSearchQuery.toLowerCase().trim();
    const qClean = q.replace(/^@/, '');
    return (
      u.display_name?.toLowerCase().includes(q) ||
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.username && u.username.toLowerCase().includes(qClean)) ||
      (u.personnel_code && u.personnel_code.toLowerCase().includes(q)) ||
      (u.student_code && u.student_code.toLowerCase().includes(q)) ||
      (u.code && u.code.toLowerCase().includes(q)) ||
      (u.subject && u.subject.toLowerCase().includes(q)) ||
      (u.grade && u.grade.toLowerCase().includes(q)) ||
      (u.department && u.department.toLowerCase().includes(q)) ||
      (u.class_name && u.class_name.toLowerCase().includes(q)) ||
      (u.job_title && u.job_title.toLowerCase().includes(q)) ||
      (u.student_name && u.student_name.toLowerCase().includes(q)) ||
      (u.student_department && u.student_department.toLowerCase().includes(q))
    );
  });

  return (
    <div className={styles.container}>
      {/* Privacy & School Integration Banner */}
      <div className={styles.privacyBanner}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <HiOutlineShieldCheck style={{ fontSize: '1.25rem', color: user?.role === 'parent' ? '#f59e0b' : '#10b981' }} />
          <span>
            {user?.role === 'parent' ? (
              <>
                <strong>سامانه ارتباط اولیا با معلمان:</strong> متصل به <strong>{schoolInfo.name}</strong> • نمایش دبیران و خانواده‌های پایه <strong>{myChildGrade}</strong>.
              </>
            ) : user?.role === 'student' ? (
              <>
                <strong>شبکه آموزشی دانش‌آموزی:</strong> متصل به <strong>{schoolInfo.name}</strong> • شما در <strong>{myUserGrade}</strong> هستید (فقط هم‌پایه‌ای‌ها و معلمان نمایش داده می‌شوند).
              </>
            ) : (
              <>
                <strong>شبکه ارتباطات آموزشی مدرسه:</strong> متصل به پایگاه داده معلمان و دانش‌آموزان <strong>{schoolInfo.name}</strong> ({schoolInfo.code}).
              </>
            )}
          </span>
        </div>
        <span style={{ fontSize: '0.75rem', color: '#38bdf8' }}>پروتکل امن تماس و پیام‌رسانی مدرسه 🇮🇷</span>
      </div>

      <div className={styles.chatWrapper}>
        {/* Contacts Sidebar */}
        <div className={styles.contactSidebar}>
          {/* School Connection & Grade Context Bar */}
          <div className={styles.schoolIdentityBar}>
            <div className={styles.schoolIdentityBadge}>
              <span>🏫</span>
              <span>{schoolInfo.name}</span>
              <span style={{ fontSize: '0.6875rem', opacity: 0.8 }}>({schoolInfo.code})</span>
            </div>
            {user?.role === 'student' && (
              <span className={styles.gradeNoticeBadge}>
                🎓 پایه شما: {myUserGrade}
              </span>
            )}
            {user?.role === 'parent' && (
              <span className={styles.gradeNoticeBadge} style={{ background: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(245, 158, 11, 0.35)', color: '#fcd34d' }}>
                👨‍👩‍👧 پایه فرزند: {myChildGrade}
              </span>
            )}
            {(user?.role === 'teacher' || user?.role === 'admin' || user?.role === 'manager') && (
              <span className={styles.gradeNoticeBadge} style={{ background: 'rgba(99, 102, 241, 0.15)', borderColor: 'rgba(99, 102, 241, 0.35)', color: '#a5b4fc' }}>
                👨‍🏫 کادر آموزشی • کلیه پایه‌ها
              </span>
            )}
          </div>

          {/* Top 3 Tabs */}
          <div className={styles.tabNav}>
            <button
              className={`${styles.tabBtn} ${activeTab === 'chats' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('chats')}
            >
              <HiOutlineChatBubbleLeftRight />
              <span>گفتگوها</span>
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'groups' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('groups')}
            >
              <HiOutlineUserGroup />
              <span>گروه‌ها ({groups.length})</span>
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'directory' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('directory')}
            >
              <HiOutlineIdentification />
              <span>دفترچه مخاطبین</span>
            </button>
          </div>

          {/* TAB 1: 1-on-1 Chats */}
          {activeTab === 'chats' && (
            <>
              <div className={styles.searchBox}>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="input"
                    style={{ paddingRight: '36px', fontSize: '0.875rem' }}
                    placeholder="جستجوی گفتگو..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <HiOutlineMagnifyingGlass
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-tertiary)',
                    }}
                  />
                </div>
              </div>

              {/* Sub-Filter Pills: تفکیک دانش‌آموزان و اولیا */}
              <div className={styles.chatFilterPills}>
                <button
                  type="button"
                  className={`${styles.chatFilterPill} ${chatRoleFilter === 'all' ? styles.chatFilterPillActive : ''}`}
                  onClick={() => setChatRoleFilter('all')}
                  title="مشاهده همه گفتگوها"
                >
                  <span>همه</span>
                  <span className={styles.chatPillCount}>{allFilteredConversations.length}</span>
                </button>

                <button
                  type="button"
                  className={`${styles.chatFilterPill} ${chatRoleFilter === 'students' ? styles.chatFilterPillActive : ''}`}
                  onClick={() => setChatRoleFilter('students')}
                  title="مشاهده فقط گفتگوهای دانش‌آموزان"
                  style={{
                    borderColor: chatRoleFilter === 'students' ? '#10b981' : undefined,
                  }}
                >
                  <span>🎓 دانش‌آموزان</span>
                  <span className={styles.chatPillCount} style={{ background: 'rgba(16, 185, 129, 0.3)', color: '#6ee7b7' }}>
                    {studentConversations.length}
                  </span>
                </button>

                <button
                  type="button"
                  className={`${styles.chatFilterPill} ${chatRoleFilter === 'parents' ? styles.chatFilterPillActive : ''}`}
                  onClick={() => setChatRoleFilter('parents')}
                  title="مشاهده فقط گفتگوهای اولیا و والدین"
                  style={{
                    borderColor: chatRoleFilter === 'parents' ? '#f59e0b' : undefined,
                  }}
                >
                  <span>👨‍👩‍👧 اولیا</span>
                  <span className={styles.chatPillCount} style={{ background: 'rgba(245, 158, 11, 0.3)', color: '#fcd34d' }}>
                    {parentConversations.length}
                  </span>
                </button>

                <button
                  type="button"
                  className={`${styles.chatFilterPill} ${chatRoleFilter === 'staff' ? styles.chatFilterPillActive : ''}`}
                  onClick={() => setChatRoleFilter('staff')}
                  title="مشاهده گفتگوهای کادر و معلمان مدرسه"
                >
                  <span>👨‍🏫 کادر مدرسه</span>
                  <span className={styles.chatPillCount}>{staffConversations.length}</span>
                </button>
              </div>

              <div className={styles.contactList}>
                {loading ? (
                  <div style={{ textAlign: 'center', padding: '30px 0' }}>
                    <div className="spinner" style={{ margin: '0 auto' }}></div>
                  </div>
                ) : displayedConversations.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-tertiary)' }}>
                    گفتگویی در این بخش یافت نشد. از تب <strong>«دفترچه مخاطبین»</strong> فرد مورد نظر را برای شروع پیام انتخاب کنید.
                  </div>
                ) : chatRoleFilter === 'all' ? (
                  <>
                    {studentConversations.length > 0 && (
                      <>
                        <div className={styles.categorySectionHeader} style={{ color: '#34d399' }}>
                          <div className={styles.categorySectionTitle}>
                            <span>🎓 گفتگوهای دانش‌آموزان</span>
                          </div>
                          <span className={styles.categorySectionBadge} style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399' }}>
                            {studentConversations.length} گفتگو
                          </span>
                        </div>
                        {studentConversations.map(renderConversationItem)}
                      </>
                    )}

                    {parentConversations.length > 0 && (
                      <>
                        <div className={styles.categorySectionHeader} style={{ color: '#fbbf24' }}>
                          <div className={styles.categorySectionTitle}>
                            <span>👨‍👩‍👧 گفتگوهای اولیا و والدین</span>
                          </div>
                          <span className={styles.categorySectionBadge} style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24' }}>
                            {parentConversations.length} گفتگو
                          </span>
                        </div>
                        {parentConversations.map(renderConversationItem)}
                      </>
                    )}

                    {staffConversations.length > 0 && (
                      <>
                        <div className={styles.categorySectionHeader} style={{ color: '#a5b4fc' }}>
                          <div className={styles.categorySectionTitle}>
                            <span>👨‍🏫 کادر مدرسه</span>
                          </div>
                          <span className={styles.categorySectionBadge} style={{ background: 'rgba(99, 102, 241, 0.2)', color: '#a5b4fc' }}>
                            {staffConversations.length} گفتگو
                          </span>
                        </div>
                        {staffConversations.map(renderConversationItem)}
                      </>
                    )}
                  </>
                ) : (
                  displayedConversations.map(renderConversationItem)
                )}
              </div>
            </>
          )}

          {/* TAB 2: School Groups */}
          {activeTab === 'groups' && (
            <>
              <div className={styles.groupHeaderAction}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>کانال‌ها و کارگروه‌ها</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.75rem', padding: '5px 9px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => {
                      setJoinLinkInput('');
                      setShowJoinGroupModal(true);
                    }}
                    title="عضویت در گروه با لینک یا کد دعوت"
                  >
                    <HiOutlineLink />
                    <span>پیوستن با لینک</span>
                  </button>
                  <button
                    type="button"
                    className={styles.createGroupBtn}
                    onClick={() => {
                      setCreateGroupMembers([]);
                      setCreateGroupMemberInput('');
                      setCreateGroupSearchResults([]);
                      setShowCreateGroupModal(true);
                    }}
                  >
                    <HiOutlinePlus />
                    <span>گروه جدید</span>
                  </button>
                </div>
              </div>

              <div className={styles.contactList}>
                {groups.map((grp) => {
                  const isActive = activeGroup?.id === grp.id;
                  return (
                    <div
                      key={grp.id}
                      className={`${styles.groupItem} ${isActive ? styles.groupItemActive : ''}`}
                      onClick={() => selectGroup(grp)}
                    >
                      <div className={styles.groupAvatar}>
                        {grp.category === 'council' ? '🏛️' : grp.category === 'parents' ? '🤝' : grp.category === 'olympiad' ? '🏆' : '📚'}
                      </div>
                      <div className={styles.contactDetails}>
                        <div className={styles.contactNameRow}>
                          <span className={styles.contactName}>{grp.name}</span>
                          <span className={styles.contactCodePill}>{grp.members_count || 1} عضو</span>
                        </div>
                        <span className={styles.lastMsgPreview}>
                          {grp.last_message ? `${grp.last_message.sender_name}: ${grp.last_message.content}` : grp.description || 'کانال رسمی مدرسه'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* TAB 3: School Directory & Personnel Codes */}
          {activeTab === 'directory' && (
            <>
              <div className={styles.searchBox}>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="input"
                    style={{ paddingRight: '36px', fontSize: '0.8125rem' }}
                    placeholder="جستجو با نام، کد پرسنلی، دپارتمان..."
                    value={dirSearchQuery}
                    onChange={(e) => setDirSearchQuery(e.target.value)}
                  />
                  <HiOutlineMagnifyingGlass
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-tertiary)',
                    }}
                  />
                </div>
              </div>

              <div className={styles.directoryFilters}>
                <button
                  className={`${styles.dirFilterChip} ${dirRoleFilter === 'all' ? styles.dirFilterChipActive : ''}`}
                  onClick={() => setDirRoleFilter('all')}
                >
                  همه ({directory.all?.length || 0})
                </button>
                <button
                  className={`${styles.dirFilterChip} ${dirRoleFilter === 'teacher' ? styles.dirFilterChipActive : ''}`}
                  onClick={() => setDirRoleFilter('teacher')}
                  style={{ borderColor: dirRoleFilter === 'teacher' ? '#6366f1' : undefined }}
                >
                  👨‍🏫 معلمان و کادر ({directory.staff?.length || 0})
                </button>
                <button
                  className={`${styles.dirFilterChip} ${dirRoleFilter === 'student' ? styles.dirFilterChipActive : ''}`}
                  onClick={() => setDirRoleFilter('student')}
                  style={{ borderColor: dirRoleFilter === 'student' ? '#10b981' : undefined }}
                >
                  🎓 دانش‌آموزان ({directory.students?.length || 0})
                </button>
                <button
                  className={`${styles.dirFilterChip} ${dirRoleFilter === 'parent' ? styles.dirFilterChipActive : ''}`}
                  onClick={() => setDirRoleFilter('parent')}
                  style={{ borderColor: dirRoleFilter === 'parent' ? '#f59e0b' : undefined }}
                >
                  👨‍👩‍👧 اولیا ({directory.parents?.length || 0})
                </button>
              </div>

              {/* Grade isolation status bar for students/parents or interactive grade filter for teachers/admins */}
              {user?.role === 'student' && (
                <div style={{ padding: '6px 16px', background: 'rgba(16, 185, 129, 0.1)', borderBottom: '1px solid var(--border-color)', fontSize: '0.75rem', color: '#6ee7b7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
                  <span>🔒 نمایش اختصاصی پایه شما: <strong>{myUserGrade}</strong></span>
                  <span style={{ fontSize: '0.6875rem', opacity: 0.85 }}>دبیران کل مدرسه + هم‌پایه‌ای‌ها ({directory.students?.length || 0} نفر)</span>
                </div>
              )}

              {user?.role === 'parent' && (
                <div style={{ padding: '6px 16px', background: 'rgba(245, 158, 11, 0.1)', borderBottom: '1px solid var(--border-color)', fontSize: '0.75rem', color: '#fcd34d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
                  <span>🔒 پایه تحصیلی فرزند: <strong>{myChildGrade}</strong></span>
                  <span style={{ fontSize: '0.6875rem', opacity: 0.85 }}>دبیران کل مدرسه + اولیا و دانش‌آموزان هم‌پایه</span>
                </div>
              )}

              {(user?.role === 'teacher' || user?.role === 'admin' || user?.role === 'manager') && (
                <div className={styles.gradeSelectorRow}>
                  <span className={styles.gradeSelectorLabel}>فیلتر پایه:</span>
                  <button
                    type="button"
                    className={`${styles.gradeFilterChip} ${dirGradeFilter === 'all' ? styles.gradeFilterChipActive : ''}`}
                    onClick={() => setDirGradeFilter('all')}
                  >
                    همه پایه‌ها
                  </button>
                  <button
                    type="button"
                    className={`${styles.gradeFilterChip} ${dirGradeFilter === 'پایه دهم' ? styles.gradeFilterChipActive : ''}`}
                    onClick={() => setDirGradeFilter('پایه دهم')}
                  >
                    پایه دهم
                  </button>
                  <button
                    type="button"
                    className={`${styles.gradeFilterChip} ${dirGradeFilter === 'پایه یازدهم' ? styles.gradeFilterChipActive : ''}`}
                    onClick={() => setDirGradeFilter('پایه یازدهم')}
                  >
                    پایه یازدهم
                  </button>
                  <button
                    type="button"
                    className={`${styles.gradeFilterChip} ${dirGradeFilter === 'پایه دوازدهم' ? styles.gradeFilterChipActive : ''}`}
                    onClick={() => setDirGradeFilter('پایه دوازدهم')}
                  >
                    پایه دوازدهم
                  </button>
                </div>
              )}

              <div className={styles.contactList}>
                {filteredDirectoryUsers.map((person) => {
                  const badge = getRoleBadge(person.role);
                  return (
                    <div key={person.id} className={styles.dirCard}>
                      <div className={styles.dirCardHeader}>
                        <div
                          className="avatar"
                          style={{
                            width: '38px',
                            height: '38px',
                            background:
                              person.role === 'student'
                                ? 'linear-gradient(135deg, #059669, #10b981)'
                                : person.role === 'parent'
                                ? 'linear-gradient(135deg, #d97706, #f59e0b)'
                                : 'linear-gradient(135deg, #4f46e5, #6366f1)',
                            color: '#ffffff',
                          }}
                        >
                          {person.display_name?.charAt(0)}
                        </div>
                        <div className={styles.dirInfo}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span className={styles.dirName}>{person.display_name}</span>
                              <span className={badge.className}>
                                {badge.icon} {badge.label}
                              </span>
                              {person.username && (
                                <span
                                  className={styles.usernameBadge}
                                  title="آیدی اختصاصی شخص (کلیک جهت کپی)"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard?.writeText(`@${person.username}`);
                                    toast.success(`آیدی @${person.username} کپی شد 📋`);
                                  }}
                                >
                                  @{person.username}
                                </span>
                              )}
                              {person.role === 'teacher' && person.subject && (
                                <span className={styles.teacherSubjectBadge}>
                                  دبیر {person.subject}
                                </span>
                              )}
                              {person.role === 'student' && person.grade && (
                                <span className={styles.studentGradeBadge}>
                                  {person.grade}
                                </span>
                              )}
                              {person.role === 'parent' && person.grade && (
                                <span className={styles.studentGradeBadge} style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fcd34d', borderColor: 'rgba(245, 158, 11, 0.4)' }}>
                                  پایه {person.grade}
                                </span>
                              )}
                            </div>
                            {person.personnel_code && (
                              <span className={styles.contactCodePill}>کد: {person.personnel_code}</span>
                            )}
                            {person.student_code && (
                              <span
                                className={styles.contactCodePill}
                                style={{
                                  background: person.role === 'parent' ? 'rgba(245, 158, 11, 0.2)' : undefined,
                                  color: person.role === 'parent' ? '#fcd34d' : undefined,
                                  borderColor: person.role === 'parent' ? 'rgba(245, 158, 11, 0.4)' : undefined,
                                }}
                              >
                                کد دانش‌آموزی: {person.student_code}
                              </span>
                            )}
                          </div>

                          {person.role === 'parent' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontSize: '0.8125rem', color: '#fbbf24' }}>
                              <span>🎓 ولی دانش‌آموز:</span>
                              <strong>{person.student_name || 'دانش‌آموز ثبت‌شده'}</strong>
                              {person.student_department && (
                                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>({person.student_department})</span>
                              )}
                            </div>
                          )}

                          <span className={styles.dirTitle}>
                            {person.job_title || (person.role === 'teacher' ? 'کادر آموزشی' : person.role === 'student' ? 'دانش‌آموز' : 'اولیا و خانواده')}
                            {person.class_name ? ` • ${person.class_name}` : (person.department && person.role !== 'parent' ? ` • ${person.department}` : '')}
                            {person.role === 'teacher' && person.grades && person.grades.length > 0 ? ` • پایه‌ها: ${person.grades.join('، ')}` : ''}
                          </span>
                        </div>
                      </div>

                    <div className={styles.dirActions}>
                      <button
                        className={styles.dirActionBtn}
                        onClick={() => handleStartDirectChat(person)}
                        title="ارسال پیام متنی"
                      >
                        <HiOutlineChatBubbleLeftRight />
                        <span>پیام</span>
                      </button>
                      <button
                        className={`${styles.dirActionBtn} ${styles.dirActionBtnCall}`}
                        onClick={() => handleTriggerCall(person, 'audio', false)}
                        title="تماس صوتی درون‌برنامه‌ای"
                      >
                        <HiOutlinePhone />
                        <span>صوتی</span>
                      </button>
                      <button
                        className={`${styles.dirActionBtn} ${styles.dirActionBtnCall}`}
                        onClick={() => handleTriggerCall(person, 'video', false)}
                        title="تماس تصویری زنده"
                      >
                        <HiOutlineVideoCamera />
                        <span>تصویری</span>
                      </button>
                    </div>
                  </div>
                );
              })}
              </div>
            </>
          )}
        </div>

        {/* Chat Main Area */}
        <div className={styles.chatArea}>
          {activeGroup ? (
            /* GROUP CHAT VIEW */
            <>
              <div className={styles.chatHeader}>
                <div className={styles.chatPartnerInfo}>
                  <div className={styles.groupAvatar} style={{ width: '42px', height: '42px', fontSize: '1.25rem' }}>
                    {activeGroup.category === 'council' ? '🏛️' : activeGroup.category === 'parents' ? '🤝' : '🏆'}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>{activeGroup.name}</h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      {activeGroup.members_count || 1} عضو • {activeGroup.description || 'کانال رسمی'}
                    </span>
                  </div>
                </div>

                <div className={styles.headerCallingTools}>
                  <button
                    className={styles.callToolBtn}
                    onClick={() => {
                      fetchGroupMembers(activeGroup.id);
                      setShowGroupMembersModal(true);
                    }}
                    title="مشاهده لیست اعضای گروه"
                  >
                    <HiOutlineUserGroup />
                    <span>اعضا ({activeGroup.members_count || 1})</span>
                  </button>
                  <button
                    className={styles.callToolBtn}
                    onClick={() => {
                      setMemberIdentifierInput('');
                      setSearchMemberResults([]);
                      setShowAddMemberModal(true);
                    }}
                    title="افزودن عضو جدید با آیدی، کد دانش‌آموزی یا پرسنلی"
                  >
                    <HiOutlineUserPlus />
                    <span>افزودن با آیدی</span>
                  </button>
                  <button
                    className={styles.callToolBtn}
                    onClick={() => setShowInviteLinkModal(true)}
                    title="مشاهده و کپی لینک دعوت گروه"
                  >
                    <HiOutlineLink />
                    <span>لینک گروه</span>
                  </button>
                  <button
                    className={styles.callToolBtn}
                    onClick={() => handleTriggerCall(activeGroup, 'audio', true)}
                  >
                    <HiOutlinePhone />
                    <span>جلسه صوتی</span>
                  </button>
                  <button
                    className={`${styles.callToolBtn} ${styles.callToolBtnVideo}`}
                    onClick={() => handleTriggerCall(activeGroup, 'video', true)}
                  >
                    <HiOutlineVideoCamera />
                    <span>ویدیو کنفرانس</span>
                  </button>
                </div>
              </div>

              {/* Group Messages Feed */}
              <div className={styles.chatMessagesFeed}>
                {groupMessages.length === 0 ? (
                  <div className={styles.emptyChat}>
                    <div style={{ fontSize: '2.5rem' }}>👥</div>
                    <p>به گروه «{activeGroup.name}» خوش آمدید.</p>
                    <span style={{ fontSize: '0.8125rem' }}>اولین پیام را ارسال کنید.</span>
                  </div>
                ) : (
                  groupMessages.map((msg) => {
                    const isOutgoing = msg.sender_id === user?.id;
                    const canEdit = msg.sender_id === user?.id && !msg.is_voice;
                    const canDelete = msg.sender_id === user?.id || user?.role === 'teacher' || user?.role === 'admin';
                    return (
                      <div
                        key={msg.id}
                        className={`${styles.messageRow} ${isOutgoing ? styles.outgoing : styles.incoming}`}
                      >
                        <div className={styles.messageBubbleWrapper}>
                          <div className={styles.messageBubble}>
                            {!isOutgoing && (
                              <div className={styles.msgSenderName}>
                                <span>{msg.sender_name}</span>
                                {msg.sender_personnel_code && (
                                  <span className={styles.senderCodeTag}>کد: {msg.sender_personnel_code}</span>
                                )}
                              </div>
                            )}
                            <p>{msg.content}</p>

                            {/* Render Attachments */}
                            {(() => {
                              const atts = parseAttachments(msg.attachments);
                              if (atts.length === 0) return null;
                              return (
                                <div style={{ marginTop: '8px' }}>
                                  {atts.map((file, idx) => {
                                    const isVideo =
                                      file.is_video ||
                                      file.mimetype?.startsWith('video') ||
                                      (!file.is_voice && file.url?.match(/\.(mp4|mkv|mov)$/i)) ||
                                      (file.url?.match(/\.webm$/i) && file.is_video);
                                    const isAudio =
                                      !isVideo &&
                                      (file.is_voice ||
                                        file.mimetype?.startsWith('audio') ||
                                        file.url?.match(/\.(mp3|ogg|wav|m4a|aac)$/i) ||
                                        (file.url?.match(/\.webm$/i) && file.is_voice));

                                    if (isVideo) {
                                      return (
                                        <div
                                          key={idx}
                                          style={{
                                            marginTop: '8px',
                                            maxWidth: '340px',
                                            borderRadius: '14px',
                                            overflow: 'hidden',
                                            border: '1px solid var(--border-color)',
                                            background: '#000',
                                          }}
                                        >
                                          <video
                                            controls
                                            src={file.url.startsWith('http') ? file.url : `http://localhost:5000${file.url}`}
                                            style={{ width: '100%', maxHeight: '220px', display: 'block', background: '#000' }}
                                            preload="metadata"
                                          />
                                          <div
                                            style={{
                                              padding: '6px 10px',
                                              fontSize: '0.75rem',
                                              fontWeight: 700,
                                              color: '#fff',
                                              background: 'rgba(15, 23, 42, 0.85)',
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '6px',
                                            }}
                                          >
                                            <span>🎬 {file.name || file.originalname || 'ویدیوی تخته هوشمند'}</span>
                                          </div>
                                        </div>
                                      );
                                    }

                                    if (isAudio) {
                                      return (
                                        <div key={idx} className={styles.voicePlayerCard}>
                                          <div className={styles.voicePlayerHeader}>
                                            <span className={styles.voicePlayerIcon}>🎙️</span>
                                            <span className={styles.voicePlayerTitle}>پیام صوتی</span>
                                          </div>
                                          <audio
                                            controls
                                            src={`http://localhost:5000${file.url}`}
                                            className={styles.voiceAudioElement}
                                            preload="metadata"
                                          />
                                        </div>
                                      );
                                    }
                                    return (
                                      <a
                                        key={idx}
                                        href={`http://localhost:5000${file.url}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={styles.attachmentCard}
                                      >
                                        <HiOutlineDocumentArrowDown style={{ fontSize: '1.25rem', color: '#38bdf8' }} />
                                        <span>{file.originalname || file.name || 'فایل پیوست'}</span>
                                      </a>
                                    );
                                  })}
                                </div>
                              );
                            })()}

                            <div className={styles.messageMeta}>
                              {msg.is_edited && <span className={styles.editedTag}>(ویرایش شده)</span>}
                              <span>
                                {new Date(msg.sent_at).toLocaleTimeString('fa-IR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                          </div>

                          {/* Message Action Buttons */}
                          <div className={styles.messageActions}>
                            {canEdit && (
                              <button
                                type="button"
                                className={styles.msgActionBtn}
                                title="ویرایش پیام"
                                onClick={() => startEditMessage(msg, true, activeGroup.id)}
                              >
                                <HiOutlinePencilSquare />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                className={`${styles.msgActionBtn} ${styles.msgActionBtnDanger}`}
                                title="حذف پیام"
                                onClick={() =>
                                  setDeleteModal({
                                    isOpen: true,
                                    message: msg,
                                    isGroup: true,
                                    groupId: activeGroup.id,
                                  })
                                }
                              >
                                <HiOutlineTrash />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input for Group */}
              <div className={styles.inputBarContainer}>
                {editingMessage && (
                  <div className={styles.editingBanner}>
                    <div className={styles.editingInfo}>
                      <HiOutlinePencilSquare className={styles.editingIcon} />
                      <span className={styles.editingLabel}>ویرایش پیام:</span>
                      <span className={styles.editingPreview}>{editingMessage.content || '...'}</span>
                    </div>
                    <button
                      type="button"
                      className={styles.cancelEditBtn}
                      onClick={cancelEditing}
                      title="انصراف از ویرایش"
                    >
                      <HiOutlineXMark />
                      <span>انصراف</span>
                    </button>
                  </div>
                )}
                {attachedFiles.length > 0 && (
                  <div className={styles.attachedFilesPreview}>
                    {attachedFiles.map((f, i) => (
                      <span key={i} className={styles.previewChip}>
                        <span>{f.originalname}</span>
                        <HiOutlineXMark style={{ cursor: 'pointer' }} onClick={() => removeAttachment(i)} />
                      </span>
                    ))}
                  </div>
                )}
                {isRecording ? (
                  <div className={styles.recordingBar}>
                    <div className={styles.recordingStatus}>
                      <span className={styles.recordingDot} />
                      <span className={styles.recordingTimer}>{formatDuration(recordingDuration)}</span>
                      <span className={styles.recordingHint}>در حال ضبط ویس گروه...</span>
                    </div>
                    <div className={styles.recordingControls}>
                      <button
                        type="button"
                        className={styles.cancelRecordBtn}
                        onClick={cancelRecording}
                        title="لغو ضبط ویس"
                      >
                        <HiOutlineTrash />
                        <span>لغو</span>
                      </button>
                      <button
                        type="button"
                        className={styles.sendRecordBtn}
                        onClick={stopAndSendRecording}
                        disabled={isUploadingVoice}
                        title="توقف و ارسال ویس"
                      >
                        <HiOutlinePaperAirplane style={{ transform: 'rotate(180deg)' }} />
                        <span>{isUploadingVoice ? 'در حال ارسال...' : 'ارسال ویس'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSendMessage} className={styles.inputBar}>
                    <input
                      type="file"
                      ref={fileInputRef}
                      style={{ display: 'none' }}
                      multiple
                      onChange={handleFileUpload}
                    />
                    <button
                      type="button"
                      className={styles.attachBtn}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingFile || isRecording}
                      title="پیوست فایل یا تصویر"
                    >
                      <HiOutlinePaperClip />
                    </button>
                    <button
                      type="button"
                      className={styles.micBtn}
                      onClick={startRecording}
                      disabled={uploadingFile || isUploadingVoice}
                      title="ضبط و ارسال پیام صوتی (ویس)"
                    >
                      <HiOutlineMicrophone />
                    </button>
                    <input
                      type="text"
                      className={styles.messageInput}
                      placeholder={
                        editingMessage
                          ? 'ویرایش متن پیام...'
                          : `ارسال پیام به گروه ${activeGroup.name}...`
                      }
                      value={newMessageText}
                      onChange={(e) => setNewMessageText(e.target.value)}
                    />
                    <button
                      type="submit"
                      className={styles.sendBtn}
                      disabled={sending}
                      title={editingMessage ? 'ذخیره تغییرات' : 'ارسال پیام'}
                      style={
                        editingMessage
                          ? { background: 'linear-gradient(135deg, #10b981, #059669)' }
                          : {}
                      }
                    >
                      {editingMessage ? (
                        <HiOutlineCheck style={{ fontSize: '1.25rem' }} />
                      ) : (
                        <HiOutlinePaperAirplane style={{ transform: 'rotate(180deg)' }} />
                      )}
                    </button>
                  </form>
                )}
              </div>
            </>
          ) : activePartner ? (
            /* 1-on-1 CHAT VIEW */
            <>
              <div className={styles.chatHeader}>
                <div className={styles.chatPartnerInfo}>
                  {(() => {
                    const badge = getRoleBadge(activePartner.role);
                    return (
                      <>
                        <div
                          className="avatar"
                          style={{
                            background:
                              activePartner.role === 'student'
                                ? 'linear-gradient(135deg, #059669, #10b981)'
                                : activePartner.role === 'parent'
                                ? 'linear-gradient(135deg, #d97706, #f59e0b)'
                                : 'linear-gradient(135deg, #4f46e5, #6366f1)',
                            color: '#ffffff',
                          }}
                        >
                          {activePartner.display_name?.charAt(0)}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>{activePartner.display_name}</h3>
                            <span className={badge.className}>
                              {badge.icon} {badge.label}
                            </span>
                            {activePartner.username && (
                              <span
                                className={styles.usernameBadge}
                                title="آیدی اختصاصی شخص (کلیک جهت کپی)"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard?.writeText(`@${activePartner.username}`);
                                  toast.success(`آیدی @${activePartner.username} کپی شد 📋`);
                                }}
                              >
                                @{activePartner.username}
                              </span>
                            )}
                            {activePartner.role === 'teacher' && activePartner.subject && (
                              <span className={styles.teacherSubjectBadge}>
                                دبیر {activePartner.subject}
                              </span>
                            )}
                            {activePartner.role === 'student' && activePartner.grade && (
                              <span className={styles.studentGradeBadge}>
                                {activePartner.grade}
                              </span>
                            )}
                            {activePartner.role === 'student' && activePartner.class_name && (
                              <span className={styles.contactCodePill}>
                                {activePartner.class_name}
                              </span>
                            )}
                            {activePartner.personnel_code && (
                              <span className={styles.contactCodePill}>کد پرسنلی: {activePartner.personnel_code}</span>
                            )}
                            {activePartner.student_code && (
                              <span className={styles.contactCodePill}>کد دانش‌آموزی: {activePartner.student_code}</span>
                            )}
                          </div>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              color:
                                activePartner.role === 'student'
                                  ? '#34d399'
                                  : activePartner.role === 'parent'
                                  ? '#fbbf24'
                                  : '#a5b4fc',
                              fontWeight: 600,
                            }}
                          >
                            {activePartner.role === 'parent'
                              ? `🎓 اولیا و خانواده • فرزند: ${activePartner.student_name || 'دانش‌آموز مدرسه'} ${activePartner.student_department ? `(${activePartner.student_department})` : ''}`
                              : activePartner.job_title ||
                                (activePartner.role === 'teacher'
                                  ? `دبیر محترم ${activePartner.department ? `• ${activePartner.department}` : ''}`
                                  : `دانش‌آموز مدرسه ${activePartner.department ? `• ${activePartner.department}` : ''}`)}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div className={styles.headerCallingTools}>
                  <button
                    className={styles.callToolBtn}
                    onClick={() => handleTriggerCall(activePartner, 'audio', false)}
                  >
                    <HiOutlinePhone />
                    <span>تماس صوتی</span>
                  </button>
                  <button
                    className={`${styles.callToolBtn} ${styles.callToolBtnVideo}`}
                    onClick={() => handleTriggerCall(activePartner, 'video', false)}
                  >
                    <HiOutlineVideoCamera />
                    <span>تماس تصویری</span>
                  </button>
                </div>
              </div>

              {/* Messages Feed */}
              <div className={styles.chatMessagesFeed}>
                {messages.length === 0 ? (
                  <div className={styles.emptyChat}>
                    <div style={{ fontSize: '2.5rem' }}>💬</div>
                    <p>هنوز پیامی بین شما و {activePartner.display_name} رد و بدل نشده است.</p>
                    <span style={{ fontSize: '0.8125rem' }}>اولین پیام را ارسال کنید!</span>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isOutgoing = msg.sender_id === user?.id;
                    const canEdit = msg.sender_id === user?.id && !msg.is_voice;
                    const canDelete = msg.sender_id === user?.id || user?.role === 'teacher' || user?.role === 'admin';
                    return (
                      <div
                        key={msg.id}
                        className={`${styles.messageRow} ${isOutgoing ? styles.outgoing : styles.incoming}`}
                      >
                        <div className={styles.messageBubbleWrapper}>
                          <div className={styles.messageBubble}>
                            <p>{msg.content}</p>

                            {/* Render Attachments */}
                            {(() => {
                              const atts = parseAttachments(msg.attachments);
                              if (atts.length === 0) return null;
                              return (
                                <div style={{ marginTop: '8px' }}>
                                  {atts.map((file, idx) => {
                                    const isVideo =
                                      file.is_video ||
                                      file.mimetype?.startsWith('video') ||
                                      (!file.is_voice && file.url?.match(/\.(mp4|mkv|mov)$/i)) ||
                                      (file.url?.match(/\.webm$/i) && file.is_video);
                                    const isAudio =
                                      !isVideo &&
                                      (file.is_voice ||
                                        file.mimetype?.startsWith('audio') ||
                                        file.url?.match(/\.(mp3|ogg|wav|m4a|aac)$/i) ||
                                        (file.url?.match(/\.webm$/i) && file.is_voice));

                                    if (isVideo) {
                                      return (
                                        <div
                                          key={idx}
                                          style={{
                                            marginTop: '8px',
                                            maxWidth: '340px',
                                            borderRadius: '14px',
                                            overflow: 'hidden',
                                            border: '1px solid var(--border-color)',
                                            background: '#000',
                                          }}
                                        >
                                          <video
                                            controls
                                            src={file.url.startsWith('http') ? file.url : `http://localhost:5000${file.url}`}
                                            style={{ width: '100%', maxHeight: '220px', display: 'block', background: '#000' }}
                                            preload="metadata"
                                          />
                                          <div
                                            style={{
                                              padding: '6px 10px',
                                              fontSize: '0.75rem',
                                              fontWeight: 700,
                                              color: '#fff',
                                              background: 'rgba(15, 23, 42, 0.85)',
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '6px',
                                            }}
                                          >
                                            <span>🎬 {file.name || file.originalname || 'ویدیوی تخته هوشمند'}</span>
                                          </div>
                                        </div>
                                      );
                                    }

                                    if (isAudio) {
                                      return (
                                        <div key={idx} className={styles.voicePlayerCard}>
                                          <div className={styles.voicePlayerHeader}>
                                            <span className={styles.voicePlayerIcon}>🎙️</span>
                                            <span className={styles.voicePlayerTitle}>پیام صوتی</span>
                                          </div>
                                          <audio
                                            controls
                                            src={`http://localhost:5000${file.url}`}
                                            className={styles.voiceAudioElement}
                                            preload="metadata"
                                          />
                                        </div>
                                      );
                                    }
                                    return (
                                      <a
                                        key={idx}
                                        href={`http://localhost:5000${file.url}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={styles.attachmentCard}
                                      >
                                        <HiOutlineDocumentArrowDown style={{ fontSize: '1.25rem', color: '#38bdf8' }} />
                                        <span>{file.originalname || file.name || 'فایل پیوست'}</span>
                                      </a>
                                    );
                                  })}
                                </div>
                              );
                            })()}

                            <div className={styles.messageMeta}>
                              {msg.is_edited && <span className={styles.editedTag}>(ویرایش شده)</span>}
                              <span>
                                {new Date(msg.sent_at).toLocaleTimeString('fa-IR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              {isOutgoing && (
                                <HiOutlineCheck
                                  style={{
                                    fontSize: '0.875rem',
                                    color: msg.is_read ? '#38bdf8' : 'inherit',
                                  }}
                                />
                              )}
                            </div>
                          </div>

                          {/* Message Action Buttons */}
                          <div className={styles.messageActions}>
                            {canEdit && (
                              <button
                                type="button"
                                className={styles.msgActionBtn}
                                title="ویرایش پیام"
                                onClick={() => startEditMessage(msg, false, null)}
                              >
                                <HiOutlinePencilSquare />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                className={`${styles.msgActionBtn} ${styles.msgActionBtnDanger}`}
                                title="حذف پیام"
                                onClick={() =>
                                  setDeleteModal({
                                    isOpen: true,
                                    message: msg,
                                    isGroup: false,
                                    groupId: null,
                                  })
                                }
                              >
                                <HiOutlineTrash />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Bottom Input */}
              <div className={styles.inputBarContainer}>
                {editingMessage && (
                  <div className={styles.editingBanner}>
                    <div className={styles.editingInfo}>
                      <HiOutlinePencilSquare className={styles.editingIcon} />
                      <span className={styles.editingLabel}>ویرایش پیام:</span>
                      <span className={styles.editingPreview}>{editingMessage.content || '...'}</span>
                    </div>
                    <button
                      type="button"
                      className={styles.cancelEditBtn}
                      onClick={cancelEditing}
                      title="انصراف از ویرایش"
                    >
                      <HiOutlineXMark />
                      <span>انصراف</span>
                    </button>
                  </div>
                )}
                {attachedFiles.length > 0 && (
                  <div className={styles.attachedFilesPreview}>
                    {attachedFiles.map((f, i) => (
                      <span key={i} className={styles.previewChip}>
                        <span>{f.originalname}</span>
                        <HiOutlineXMark style={{ cursor: 'pointer' }} onClick={() => removeAttachment(i)} />
                      </span>
                    ))}
                  </div>
                )}
                {isRecording ? (
                  <div className={styles.recordingBar}>
                    <div className={styles.recordingStatus}>
                      <span className={styles.recordingDot} />
                      <span className={styles.recordingTimer}>{formatDuration(recordingDuration)}</span>
                      <span className={styles.recordingHint}>در حال ضبط پیام صوتی (ویس)...</span>
                    </div>
                    <div className={styles.recordingControls}>
                      <button
                        type="button"
                        className={styles.cancelRecordBtn}
                        onClick={cancelRecording}
                        title="لغو ضبط ویس"
                      >
                        <HiOutlineTrash />
                        <span>لغو</span>
                      </button>
                      <button
                        type="button"
                        className={styles.sendRecordBtn}
                        onClick={stopAndSendRecording}
                        disabled={isUploadingVoice}
                        title="توقف و ارسال ویس"
                      >
                        <HiOutlinePaperAirplane style={{ transform: 'rotate(180deg)' }} />
                        <span>{isUploadingVoice ? 'در حال ارسال...' : 'ارسال ویس'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSendMessage} className={styles.inputBar}>
                    <input
                      type="file"
                      ref={fileInputRef}
                      style={{ display: 'none' }}
                      multiple
                      onChange={handleFileUpload}
                    />
                    <button
                      type="button"
                      className={styles.attachBtn}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingFile || isRecording}
                      title="پیوست فایل، عکس یا جزوه"
                    >
                      <HiOutlinePaperClip />
                    </button>
                    <button
                      type="button"
                      className={styles.micBtn}
                      onClick={startRecording}
                      disabled={uploadingFile || isUploadingVoice}
                      title="ضبط و ارسال پیام صوتی (ویس)"
                    >
                      <HiOutlineMicrophone />
                    </button>
                    <input
                      type="text"
                      className={styles.messageInput}
                      placeholder={
                        editingMessage
                          ? 'ویرایش متن پیام...'
                          : `ارسال پیام امن به ${activePartner.display_name}...`
                      }
                      value={newMessageText}
                      onChange={(e) => setNewMessageText(e.target.value)}
                    />
                    <button
                      type="submit"
                      className={styles.sendBtn}
                      disabled={sending}
                      title={editingMessage ? 'ذخیره تغییرات' : 'ارسال پیام'}
                      style={
                        editingMessage
                          ? { background: 'linear-gradient(135deg, #10b981, #059669)' }
                          : {}
                      }
                    >
                      {editingMessage ? (
                        <HiOutlineCheck style={{ fontSize: '1.25rem' }} />
                      ) : (
                        <HiOutlinePaperAirplane style={{ transform: 'rotate(180deg)' }} />
                      )}
                    </button>
                  </form>
                )}
              </div>
            </>
          ) : (
            <div className={styles.emptyChat}>
              <div style={{ fontSize: '3.5rem' }}>🛡️</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>مرکز پیام‌رسانی هوشمند مدرسه</h3>
              <p>برای شروع گفتگو یا تماس، از ستون سمت راست یک مخاطب، گروه یا از تب دفترچه پرسنل فرد مورد نظر را انتخاب نمایید.</p>
            </div>
          )}
        </div>
      </div>

      {/* Call Modal */}
      <CallModal
        isOpen={callModal.isOpen}
        onClose={() => setCallModal((prev) => ({ ...prev, isOpen: false }))}
        callType={callModal.callType}
        partner={callModal.partner}
        isGroup={callModal.isGroup}
      />

      {/* Create Group Modal */}
      {showCreateGroupModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowCreateGroupModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>ایجاد گروه گفتگوی جدید</h2>
              <button className={styles.closeBtn} onClick={() => setShowCreateGroupModal(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateGroup}>
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>نام گروه یا کانال *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="مثلاً: کارگروه مسابقات فیزیک"
                  value={newGroupForm.name}
                  onChange={(e) => setNewGroupForm({ ...newGroupForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>دسته‌بندی گروه</label>
                <select
                  className="input"
                  value={newGroupForm.category}
                  onChange={(e) => setNewGroupForm({ ...newGroupForm, category: e.target.value })}
                >
                  <option value="council">شورای دبیران و کادر</option>
                  <option value="parents">انجمن اولیاء و مربیان</option>
                  <option value="olympiad">کارگروه المپیاد و پژوهش</option>
                  <option value="class">کلاس درسی</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>توضیحات و اهداف گروه</label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="توضیحات کوتاه درباره موضوع فعالیت این گروه..."
                  value={newGroupForm.description}
                  onChange={(e) => setNewGroupForm({ ...newGroupForm, description: e.target.value })}
                />
              </div>

              {/* Add members by identifier right during group creation */}
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <HiOutlineUserPlus />
                  <span>افزودن اعضا با آیدی / نام کاربری / کد دانش‌آموزی یا پرسنلی</span>
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="جستجو با @نام‌کاربری، کد ملی، کد دانش‌آموزی، شماره..."
                    value={createGroupMemberInput}
                    onChange={(e) => {
                      setCreateGroupMemberInput(e.target.value);
                      handleSearchUsers(e.target.value, 'create');
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleSearchUsers(createGroupMemberInput, 'create')}
                    disabled={searchingCreateMember}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {searchingCreateMember ? 'جستجو...' : 'جستجو'}
                  </button>
                </div>

                {/* Live search results */}
                {createGroupSearchResults.length > 0 && (
                  <div className={styles.userSearchPreviewBox}>
                    {createGroupSearchResults.map((u) => {
                      const isAdded = createGroupMembers.some((m) => m.id === u.id);
                      const roleBadge = getRoleBadge(u.role);
                      return (
                        <div key={u.id} className={styles.userSearchCard}>
                          <div className={styles.userSearchCardInfo}>
                            <div className={styles.userSearchAvatar}>
                              {u.display_name?.charAt(0) || '👤'}
                            </div>
                            <div className={styles.userSearchMeta}>
                              <div className={styles.userSearchName}>{u.display_name}</div>
                              <div className={styles.userSearchSub}>
                                <span>@{u.username || u.identifier_code}</span>
                                <span>•</span>
                                <span>{roleBadge.label}</span>
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            className={`btn ${isAdded ? 'btn-secondary' : 'btn-primary'} ${styles.userSearchAddBtn}`}
                            disabled={isAdded}
                            onClick={() => handleAddMemberToCreateList(u)}
                          >
                            {isAdded ? 'اضافه شد ✓' : '+ افزودن'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Selected members chips */}
                {createGroupMembers.length > 0 && (
                  <div style={{ marginTop: '10px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      اعضای اضافه‌شده به این گروه ({createGroupMembers.length} نفر):
                    </span>
                    <div className={styles.memberChipsList}>
                      {createGroupMembers.map((m) => (
                        <div key={m.id} className={styles.memberChip}>
                          <span>👤 {m.display_name}</span>
                          <span style={{ fontSize: '0.6875rem', opacity: 0.75 }}>
                            (@{m.username || m.identifier_code})
                          </span>
                          <button
                            type="button"
                            className={styles.memberChipRemove}
                            onClick={() => handleRemoveMemberFromCreateList(m.id)}
                            title="حذف از لیست"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '8px', lineHeight: '1.5' }}>
                  🔗 پس از ساخت، «لینک دعوت و کد عضویت اختصاصی» این گروه نیز در اختیارتان قرار می‌گیرد تا برای سایرین بفرستید.
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  تأیید و ساخت گروه
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateGroupModal(false)}
                >
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 1: Add Member By Identifier to Existing Active Group */}
      {showAddMemberModal && activeGroup && (
        <div className={styles.modalBackdrop} onClick={() => setShowAddMemberModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.25rem' }}>➕</span>
                <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, margin: 0 }}>
                  افزودن عضو با آیدی به «{activeGroup.name}»
                </h2>
              </div>
              <button className={styles.closeBtn} onClick={() => setShowAddMemberModal(false)}>
                &times;
              </button>
            </div>

            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: '1.6' }}>
              شناسه کاربری (مانند <code>@ali_rezaei</code>)، کد دانش‌آموزی، کد پرسنلی، ایمیل یا شماره موبایل فرد را وارد کنید:
            </p>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input
                type="text"
                className="input"
                placeholder="مثلاً: @moradi_math یا کد ۴۰۳۰۱..."
                value={memberIdentifierInput}
                onChange={(e) => {
                  setMemberIdentifierInput(e.target.value);
                  handleSearchUsers(e.target.value, 'active');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddMemberByIdentifier();
                  }
                }}
                autoFocus
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleAddMemberByIdentifier()}
                disabled={addingMember || !memberIdentifierInput.trim()}
                style={{ whiteSpace: 'nowrap' }}
              >
                {addingMember ? 'در حال افزودن...' : 'افزودن مستقیم'}
              </button>
            </div>

            {/* Quick Suggestions / Search Results */}
            {searchMemberResults.length > 0 && (
              <div style={{ marginBottom: '14px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>نتایج منطبق:</span>
                <div className={styles.userSearchPreviewBox}>
                  {searchMemberResults.map((u) => {
                    const roleBadge = getRoleBadge(u.role);
                    return (
                      <div key={u.id} className={styles.userSearchCard}>
                        <div className={styles.userSearchCardInfo}>
                          <div className={styles.userSearchAvatar}>
                            {u.display_name?.charAt(0) || '👤'}
                          </div>
                          <div className={styles.userSearchMeta}>
                            <div className={styles.userSearchName}>{u.display_name}</div>
                            <div className={styles.userSearchSub}>
                              <span>@{u.username || u.identifier_code}</span>
                              <span>•</span>
                              <span>{roleBadge.label}</span>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className={`btn btn-primary ${styles.userSearchAddBtn}`}
                          disabled={addingMember}
                          onClick={() => handleAddMemberByIdentifier(u.username || u.identifier_code || u.id)}
                        >
                          + افزودن به گروه
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.8125rem' }}
                onClick={() => {
                  setShowAddMemberModal(false);
                  setShowInviteLinkModal(true);
                }}
              >
                🔗 دریافت لینک دعوت به جای آیدی
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowAddMemberModal(false)}
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Group Invite Link & Invite Code Modal */}
      {showInviteLinkModal && activeGroup && (
        <div className={styles.modalBackdrop} onClick={() => setShowInviteLinkModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.25rem' }}>🔗</span>
                <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, margin: 0 }}>
                  لینک دعوت به گروه «{activeGroup.name}»
                </h2>
              </div>
              <button className={styles.closeBtn} onClick={() => setShowInviteLinkModal(false)}>
                &times;
              </button>
            </div>

            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: '1.6' }}>
              افرادی که این لینک یا کد دعوت را داشته باشند، می‌توانند با یک کلیک یا وارد کردن کد مستقیماً به این گروه ملحق شوند:
            </p>

            <div className={styles.inviteLinkCard}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
                  لینک اختصاصی دعوت:
                </label>
                <div className={styles.inviteLinkRow}>
                  <input
                    type="text"
                    readOnly
                    value={getFullInviteLink(activeGroup)}
                    className={`input ${styles.inviteLinkInput}`}
                  />
                  <button
                    type="button"
                    className={`btn ${copiedLink ? 'btn-secondary' : 'btn-primary'} ${styles.copyLinkBtn}`}
                    onClick={() => handleCopyInviteLink(activeGroup)}
                  >
                    {copiedLink ? (
                      <>
                        <HiOutlineClipboardDocumentCheck style={{ color: '#10b981' }} />
                        <span>کپی شد ✓</span>
                      </>
                    ) : (
                      <>
                        <HiOutlineClipboardDocument />
                        <span>کپی لینک</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
                  کد عضویت مستقیم:
                </label>
                <div className={styles.inviteCodeBadgeBox}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>کد گروه:</span>
                    <span className={styles.inviteCodeText}>
                      {activeGroup.invite_code || activeGroup.id}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                    onClick={() => handleCopyInviteCode(activeGroup.invite_code || activeGroup.id)}
                  >
                    {copiedCode ? 'کپی شد ✓' : 'کپی کد'}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowInviteLinkModal(false)}
              >
                متوجه شدم
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Join Group By Link / Code Modal */}
      {showJoinGroupModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowJoinGroupModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.25rem' }}>🚪</span>
                <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, margin: 0 }}>
                  پیوستن به گروه با لینک یا کد دعوت
                </h2>
              </div>
              <button className={styles.closeBtn} onClick={() => setShowJoinGroupModal(false)}>
                &times;
              </button>
            </div>

            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: '1.6' }}>
              لینک دعوتی که دریافت کرده‌اید یا کد عضویت گروه (مثلاً <code>GRP-XXXX</code>) را در کادر زیر وارد نمایید:
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleJoinGroupByLink();
              }}
            >
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <input
                  type="text"
                  className="input"
                  placeholder="لینک کامل دعوت یا کد اختصاصی گروه..."
                  value={joinLinkInput}
                  onChange={(e) => setJoinLinkInput(e.target.value)}
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  autoFocus
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowJoinGroupModal(false)}
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={joiningGroup || !joinLinkInput.trim()}
                >
                  {joiningGroup ? 'در حال عضویت...' : 'پیوستن به گروه 🎉'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: View Group Members Roster Modal */}
      {showGroupMembersModal && activeGroup && (
        <div className={styles.modalBackdrop} onClick={() => setShowGroupMembersModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.25rem' }}>👥</span>
                <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, margin: 0 }}>
                  اعضای گروه «{activeGroup.name}»
                </h2>
              </div>
              <button className={styles.closeBtn} onClick={() => setShowGroupMembersModal(false)}>
                &times;
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ fontSize: '0.8125rem', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => {
                  setShowGroupMembersModal(false);
                  setShowAddMemberModal(true);
                }}
              >
                <HiOutlineUserPlus />
                <span>+ افزودن با آیدی</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.8125rem', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => {
                  setShowGroupMembersModal(false);
                  setShowInviteLinkModal(true);
                }}
              >
                <HiOutlineLink />
                <span>کپی لینک دعوت</span>
              </button>
            </div>

            {loadingMembers ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-tertiary)' }}>
                در حال بارگذاری اعضا...
              </div>
            ) : groupMembersList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-tertiary)' }}>
                عضوی یافت نشد.
              </div>
            ) : (
              <div className={styles.groupMembersContainer}>
                {groupMembersList.map((m) => {
                  const roleBadge = getRoleBadge(m.role);
                  return (
                    <div key={m.id} className={styles.groupMemberRow}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className={styles.userSearchAvatar}>
                          {m.display_name?.charAt(0) || '👤'}
                        </div>
                        <div>
                          <div style={{ fontSize: '0.875rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{m.display_name}</span>
                            {m.group_role === 'admin' && (
                              <span className={styles.memberAdminBadge}>👑 مدیر گروه</span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', display: 'flex', gap: '6px' }}>
                            <span>@{m.username || m.identifier_code}</span>
                            <span>•</span>
                            <span>{roleBadge.label}</span>
                          </div>
                        </div>
                      </div>

                      {m.id !== user?.id && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                          onClick={() => {
                            setShowGroupMembersModal(false);
                            handleStartDirectChat(m);
                          }}
                        >
                          پیام مستقیم
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowGroupMembersModal(false)}
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Message Confirmation Modal */}
      {deleteModal.isOpen && (
        <div
          className={styles.modalBackdrop}
          onClick={() => setDeleteModal({ isOpen: false, message: null, isGroup: false, groupId: null })}
        >
          <div
            className={styles.modalContent}
            style={{ maxWidth: '440px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.5rem', color: '#ef4444' }}>🗑️</span>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0 }}>حذف پیام</h2>
              </div>
              <button
                className={styles.closeBtn}
                onClick={() => setDeleteModal({ isOpen: false, message: null, isGroup: false, groupId: null })}
              >
                &times;
              </button>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: '1.6', marginBottom: '16px' }}>
              آیا از حذف این پیام اطمینان دارید؟ این پیام برای تمامی شرکت‌کنندگان گفتگو حذف خواهد شد و غیرقابل بازگشت است.
            </p>

            {deleteModal.message?.content && (
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.25)',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '0.8125rem',
                  color: 'var(--text-primary)',
                  marginBottom: '20px',
                  borderRight: '3px solid #ef4444',
                  maxHeight: '90px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  lineHeight: '1.5',
                }}
              >
                «{deleteModal.message.content}»
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteModal({ isOpen: false, message: null, isGroup: false, groupId: null })}
              >
                انصراف
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: '#ef4444', color: '#ffffff', fontWeight: 700 }}
                onClick={handleDeleteMessage}
              >
                حذف قطعی پیام
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
