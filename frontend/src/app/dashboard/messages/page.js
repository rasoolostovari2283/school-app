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
  HiOutlineArrowRight,
} from 'react-icons/hi2';
import CallModal from '../../../components/communication/CallModal';
import MessageAttachments from '../../../components/communication/MessageAttachments';
import MessageComposer from '../../../components/communication/MessageComposer';
import { getSocket } from '../../../lib/socket';
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

const getLastMsgPreviewText = (lastMsg) => {
  if (!lastMsg) return 'شروع گفتگوی خصوصی...';
  if (lastMsg.content && String(lastMsg.content).trim()) return lastMsg.content;
  const atts = parseAttachments(lastMsg.attachments);
  if (atts.length > 0) {
    const first = atts[0];
    if (first.media_type === 'image' || first.mimetype?.startsWith('image/')) return '🖼️ تصویر';
    if (first.media_type === 'video' || first.mimetype?.startsWith('video/')) return '🎬 ویدیو';
    if (first.media_type === 'audio' || first.is_voice || first.mimetype?.startsWith('audio/')) return '🎙️ پیام صوتی';
    return '📎 فایل پیوست';
  }
  return 'پیام جدید';
};

export default function MessagesPage() {
  const { user } = useAuthStore();
  const searchParams = useSearchParams();
  const targetUserId = searchParams.get('user') || searchParams.get('partner');

  // Active view tab: 'chats' | 'groups' | 'directory'
  const [activeTab, setActiveTab] = useState('chats');

  // Chat Sub-Filter: 'all' | 'students' | 'parents' | 'staff'
  const [chatRoleFilter, setChatRoleFilter] = useState('all');

  // Role Badge Helper (explicitly distinguishes School Principal vs Teacher vs Student vs Parent)
  const getRoleBadge = (role, person = null) => {
    if (person?.is_principal || role === 'admin' || role === 'manager') {
      return { label: 'مدیر مدرسه', icon: '👑', className: styles.roleBadgePrincipal };
    }
    if (role === 'student') {
      return { label: 'دانش‌آموز', icon: '🎓', className: styles.roleBadgeStudent };
    }
    if (role === 'parent') {
      return { label: 'ولی دانش‌آموز', icon: '👨‍👩‍👧', className: styles.roleBadgeParent };
    }
    return { label: 'معلم', icon: '👨‍🏫', className: styles.roleBadgeTeacher };
  };

  // 1-on-1 Conversations
  const [conversations, setConversations] = useState([]);
  const [activePartner, setActivePartner] = useState(null);
  const [messages, setMessages] = useState([]);

  // Live @username backend search in Chats tab
  const [liveUserSearchResults, setLiveUserSearchResults] = useState([]);
  const [searchingLiveUsers, setSearchingLiveUsers] = useState(false);

  // Groups
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [groupMessages, setGroupMessages] = useState([]);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupForm, setNewGroupForm] = useState({
    name: '',
    group_handle: '',
    description: '',
    category: 'class',
    member_ids: [],
  });

  // Group search by @handle / invite code / link / name
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [groupSearchResults, setGroupSearchResults] = useState([]);
  const [searchingGroups, setSearchingGroups] = useState(false);
  const [joiningGroupId, setJoiningGroupId] = useState(null);

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
  const [copiedHandle, setCopiedHandle] = useState(false);

  // Join by Link state
  const [joinLinkInput, setJoinLinkInput] = useState('');
  const [joiningGroup, setJoiningGroup] = useState(false);

  // Image Lightbox state
  const [lightboxImage, setLightboxImage] = useState(null);

  // In Create Group Modal: Added members list
  const [createGroupMembers, setCreateGroupMembers] = useState([]);
  const [createGroupMemberInput, setCreateGroupMemberInput] = useState('');
  const [createGroupSearchResults, setCreateGroupSearchResults] = useState([]);
  const [searchingCreateMember, setSearchingCreateMember] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [showDirectoryPickerInCreate, setShowDirectoryPickerInCreate] = useState(false);
  const [createGroupDirFilter, setCreateGroupDirFilter] = useState('all');

  // Directory & School Database Integration
  const [directory, setDirectory] = useState({
    defaultContacts: [],
    staff: [],
    students: [],
    parents: [],
    all: [],
  });
  const [dirSearchQuery, setDirSearchQuery] = useState('');
  const [dirRoleFilter, setDirRoleFilter] = useState('all');
  const [dirGradeFilter, setDirGradeFilter] = useState('all');
  const [schoolInfo, setSchoolInfo] = useState({
    name: user?.school_name || 'مدرسه هوشمند',
    code: user?.school_code || '',
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
  const activePartnerRef = useRef(null);
  const activeGroupRef = useRef(null);

  useEffect(() => {
    activePartnerRef.current = activePartner;
  }, [activePartner]);

  useEffect(() => {
    activeGroupRef.current = activeGroup;
  }, [activeGroup]);

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

  // Real-time Socket.IO subscription for incoming 1-on-1 and Group messages
  useEffect(() => {
    if (!user?.id) return;
    let socket;
    try {
      socket = getSocket();
    } catch (e) {
      return;
    }

    const onDirectMessage = (incoming) => {
      if (!incoming || !incoming.id) return;
      const partner = activePartnerRef.current;
      if (
        partner &&
        ((incoming.sender_id === partner.id && incoming.receiver_id === user.id) ||
          (incoming.sender_id === user.id && incoming.receiver_id === partner.id))
      ) {
        const normalized = {
          ...incoming,
          attachments: parseAttachments(incoming.attachments),
        };
        setMessages((prev) =>
          prev.some((m) => m.id === normalized.id) ? prev : [...prev, normalized]
        );
      }
      fetchConversations();
    };

    const onGroupMessage = (payload) => {
      const incoming = payload?.message;
      const grpId = payload?.group_id || incoming?.group_id;
      if (!incoming || !incoming.id) return;
      if (activeGroupRef.current?.id === grpId) {
        const normalized = {
          ...incoming,
          attachments: parseAttachments(incoming.attachments),
        };
        setGroupMessages((prev) =>
          prev.some((m) => m.id === normalized.id) ? prev : [...prev, normalized]
        );
      }
      fetchGroups();
    };

    socket.on('message:new', onDirectMessage);
    socket.on('group:message:new', onGroupMessage);

    return () => {
      socket.off('message:new', onDirectMessage);
      socket.off('group:message:new', onGroupMessage);
    };
  }, [user?.id]);

  // Join/leave active Socket.IO group room
  useEffect(() => {
    const grpId = activeGroup?.id;
    if (!grpId) return;
    let socket;
    try {
      socket = getSocket();
      socket.emit('join_message_group', { groupId: grpId });
    } catch (e) {
      return;
    }
    return () => {
      try {
        socket.emit('leave_message_group', { groupId: grpId });
      } catch (e) {}
    };
  }, [activeGroup?.id]);

  // Debounced live @username search across school users in Chats tab
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setLiveUserSearchResults([]);
      setSearchingLiveUsers(false);
      return;
    }
    let cancelled = false;
    setSearchingLiveUsers(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/messages/users/search?q=${encodeURIComponent(q)}`);
        if (!cancelled) {
          setLiveUserSearchResults(res.data?.data?.users || []);
        }
      } catch (err) {
        if (!cancelled) setLiveUserSearchResults([]);
      } finally {
        if (!cancelled) setSearchingLiveUsers(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  // Debounced live group search by @group_handle, invite link, code, or name
  useEffect(() => {
    const q = groupSearchQuery.trim();
    if (q.length < 2) {
      setGroupSearchResults([]);
      setSearchingGroups(false);
      return;
    }
    let cancelled = false;
    setSearchingGroups(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/messages/groups/search?q=${encodeURIComponent(q)}`);
        if (!cancelled) {
          setGroupSearchResults(res.data?.data?.groups || []);
        }
      } catch (err) {
        if (!cancelled) setGroupSearchResults([]);
      } finally {
        if (!cancelled) setSearchingGroups(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [groupSearchQuery]);

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
      if (typeof window !== 'undefined' && window.innerWidth > 900) {
        selectConversation(conversations[0].user);
      }
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
    const fallbackCode = user?.school_code || '';
    const fallbackName = user?.school_name || 'مدرسه هوشمند';

    let backendData = { default_contacts: [], staff: [], students: [], parents: [], all: [], school: null };
    try {
      const res = await api.get('/messages/directory');
      if (res.data?.data) {
        backendData = res.data.data;
      }
    } catch (err) {
      console.error('Error fetching backend directory:', err);
    }

    const currentName = backendData.school?.name || fallbackName;
    const currentCode = backendData.school?.username ? `@${backendData.school.username}` : (backendData.school?.code || fallbackCode);
    setSchoolInfo({ code: currentCode, name: currentName });

    // Preserve real roles (principal admin/manager vs teacher) from DB
    const staffList = (backendData.staff || []).map((st) => {
      const isPrincipal = Boolean(st.is_principal || st.role === 'admin' || st.role === 'manager');
      return {
        ...st,
        role: st.role || 'teacher',
        is_principal: isPrincipal,
        role_label: st.role_label || (isPrincipal ? 'مدیر مدرسه' : 'معلم'),
        school_code: currentCode,
      };
    });

    // Sort principals first, then teachers alphabetically
    staffList.sort((a, b) => {
      if (a.is_principal && !b.is_principal) return -1;
      if (!a.is_principal && b.is_principal) return 1;
      return String(a.display_name || '').localeCompare(String(b.display_name || ''), 'fa');
    });

    const defaultContacts = (backendData.default_contacts && backendData.default_contacts.length > 0
      ? backendData.default_contacts
      : staffList
    ).map((st) => {
      const isPrincipal = Boolean(st.is_principal || st.role === 'admin' || st.role === 'manager');
      return {
        ...st,
        is_principal: isPrincipal,
        role_label: st.role_label || (isPrincipal ? 'مدیر مدرسه' : 'معلم'),
      };
    });

    const rawStudents = (backendData.students || []).map((st) => ({
      ...st,
      role: 'student',
      grade: st.grade || extractGrade(st.department) || '',
      school_code: currentCode,
    }));

    const rawParents = (backendData.parents || []).map((p) => {
      const g = p.grade || p.student_grade || extractGrade(p.student_department) || '';
      return {
        ...p,
        role: 'parent',
        grade: g,
        student_grade: g,
        school_code: currentCode,
      };
    });

    const allCombined = [...staffList, ...rawStudents, ...rawParents];

    setDirectory({
      defaultContacts,
      staff: staffList,
      students: rawStudents,
      parents: rawParents,
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
    navigator.clipboard?.writeText(code);
    setCopiedCode(true);
    toast.success(`کد دعوت «${code}» کپی شد 📋`);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleCopyGroupHandle = (handle) => {
    if (!handle) return;
    const text = `@${handle.replace(/^@/, '')}`;
    navigator.clipboard?.writeText(text);
    setCopiedHandle(true);
    toast.success(`آیدی گروه ${text} کپی شد 📋`);
    setTimeout(() => setCopiedHandle(false), 2500);
  };

  const handleJoinGroupByLink = async (codeToJoin, groupIdForSpinner = null) => {
    const code = (codeToJoin || joinLinkInput).trim();
    if (!code) {
      toast.error('لطفاً لینک، کد دعوت یا @آیدی گروه را وارد کنید');
      return;
    }

    setJoiningGroup(true);
    if (groupIdForSpinner) setJoiningGroupId(groupIdForSpinner);
    try {
      const res = await api.post('/messages/groups/join', { invite_code: code });
      toast.success(res.data.message || 'با موفقیت به گروه پیوستید 🎉');
      setJoinLinkInput('');
      setGroupSearchQuery('');
      setGroupSearchResults([]);
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
      setJoiningGroupId(null);
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
            content: '',
            attachments: [uploadedFile],
          });
          const serverMsg = res.data.data.message;
          if (serverMsg) {
            serverMsg.attachments = parseAttachments(serverMsg.attachments);
            setGroupMessages((prev) =>
              prev.some((m) => m.id === serverMsg.id) ? prev : [...prev, serverMsg]
            );
          }
          fetchGroups();
          toast.success('ویس با موفقیت به گروه ارسال شد 🎙️');
        } else if (activePartner) {
          const optimisticMsg = {
            id: 'temp-' + Date.now(),
            sender_id: user?.id,
            receiver_id: activePartner.id,
            content: '',
            attachments: [uploadedFile],
            sent_at: new Date().toISOString(),
            is_read: false,
          };
          setMessages((prev) => [...prev, optimisticMsg]);

          const res = await api.post('/messages', {
            receiver_id: activePartner.id,
            content: '',
            attachments: [uploadedFile],
          });
          const serverMsg = res.data.data.message;
          if (serverMsg) {
            serverMsg.attachments = parseAttachments(serverMsg.attachments);
            setMessages((prev) => {
              const withoutTemp = prev.filter((m) => m.id !== optimisticMsg.id);
              return withoutTemp.some((m) => m.id === serverMsg.id)
                ? withoutTemp
                : [...withoutTemp, serverMsg];
            });
          }
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
          setGroupMessages((prev) =>
            prev.some((m) => m.id === serverMsg.id) ? prev : [...prev, serverMsg]
          );
        }
        fetchGroups();
      } catch (err) {
        toast.error(err.response?.data?.message || 'خطا در ارسال پیام به گروه');
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
          setMessages((prev) => {
            const withoutOpt = prev.filter((m) => m.id !== optimisticMsg.id);
            return withoutOpt.some((m) => m.id === serverMsg.id)
              ? withoutOpt
              : [...withoutOpt, serverMsg];
          });
        }
        fetchConversations();
      } catch (err) {
        toast.error(err.response?.data?.message || 'خطا در ارسال پیام');
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
    if (e && e.preventDefault) e.preventDefault();
    if (!newGroupForm.name.trim()) {
      toast.error('لطفاً نام گروه را وارد کنید');
      return;
    }

    setCreatingGroup(true);
    try {
      const memberIds = createGroupMembers.map((m) => m.id).filter(Boolean);
      const memberIdentifiers = [];
      if (createGroupMemberInput.trim()) {
        memberIdentifiers.push(createGroupMemberInput.trim());
      }

      const res = await api.post('/messages/groups', {
        name: newGroupForm.name.trim(),
        group_handle: newGroupForm.group_handle?.trim() || undefined,
        description: newGroupForm.description?.trim() || '',
        category: newGroupForm.category || 'class',
        member_ids: memberIds,
        member_identifiers: memberIdentifiers,
      });
      const createdGrp = res.data?.data?.group;
      toast.success('گروه با موفقیت ساخته شد 🎉');
      setShowCreateGroupModal(false);
      setShowDirectoryPickerInCreate(false);
      setNewGroupForm({ name: '', group_handle: '', description: '', category: 'class', member_ids: [] });
      setCreateGroupMembers([]);
      setCreateGroupMemberInput('');
      setCreateGroupSearchResults([]);
      await fetchGroups();
      if (createdGrp) {
        selectGroup(createdGrp);
        setActiveTab('groups');
        setShowInviteLinkModal(true);
      }
    } catch (err) {
      console.error('Error creating group:', err);
      toast.error(err.response?.data?.message || 'خطا در ایجاد گروه');
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleDeleteGroup = async (group) => {
    if (!group) return;
    if (!window.confirm(`آیا از حذف گروه «${group.name}» اطمینان دارید؟ تمامی پیام‌های آن حذف خواهد شد.`)) {
      return;
    }
    try {
      await api.delete(`/messages/groups/${group.id}`);
      toast.success('گروه با موفقیت حذف گردید');
      if (activeGroup?.id === group.id) {
        setActiveGroup(null);
      }
      fetchGroups();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در حذف گروه');
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
    const isPrincipal = Boolean(item.user.is_principal || item.user.role === 'admin' || item.user.role === 'manager');
    const badge = getRoleBadge(item.user.role, item.user);
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
            background: isPrincipal
              ? 'linear-gradient(135deg, #b45309, #f59e0b)'
              : item.user.role === 'student'
              ? '#059669'
              : item.user.role === 'parent'
              ? '#d97706'
              : '#4f46e5',
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
              {getLastMsgPreviewText(item.last_message)}
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
    if (dirRoleFilter === 'teacher') {
      const isStaff = u.is_principal || u.role === 'teacher' || u.role === 'admin' || u.role === 'manager';
      if (!isStaff) return false;
    } else if (dirRoleFilter !== 'all' && u.role !== dirRoleFilter) {
      return false;
    }

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

  const isChatSelected = Boolean(activePartner || activeGroup);

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
        <div className={`${styles.contactSidebar} ${isChatSelected ? styles.sidebarHiddenMobile : ''}`}>
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
              <span>لیست مخاطبین</span>
            </button>
          </div>

          {/* TAB 1: 1-on-1 Chats & Live @username Search */}
          {activeTab === 'chats' && (
            <>
              <div className={styles.searchBox}>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="input"
                    style={{ paddingRight: '36px', fontSize: '0.875rem' }}
                    placeholder="جستجو با @نام‌کاربری یا نام فرد..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    data-testid="chat-user-search-input"
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

              {/* Live Backend @username Search Results */}
              {searchQuery.trim().length >= 2 && (
                <div className={styles.liveSearchSection} data-testid="live-user-search-results">
                  <div className={styles.liveSearchHeader}>
                    <span>🔎 نتایج جستجو با نام کاربری در مدرسه</span>
                    {searchingLiveUsers && <span>در حال جستجو...</span>}
                  </div>
                  {!searchingLiveUsers && liveUserSearchResults.length === 0 ? (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      کاربری با این نام کاربری در مدرسه یافت نشد.
                    </span>
                  ) : (
                    liveUserSearchResults.map((u) => {
                      const badge = getRoleBadge(u.role, u);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          className={styles.liveSearchResultItem}
                          onClick={() => {
                            setSearchQuery('');
                            setLiveUserSearchResults([]);
                            handleStartDirectChat(u);
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {u.display_name}
                              </span>
                              <span className={badge.className}>{badge.icon} {badge.label}</span>
                            </div>
                            {u.username && (
                              <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontFamily: 'monospace', direction: 'ltr', textAlign: 'right' }}>
                                @{u.username}
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#818cf8', flexShrink: 0 }}>
                            شروع گفتگو ←
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}

              {/* Sub-Filter Pills */}
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
                  className={`${styles.chatFilterPill} ${chatRoleFilter === 'staff' ? styles.chatFilterPillActive : ''}`}
                  onClick={() => setChatRoleFilter('staff')}
                  title="مدیر و معلمان مدرسه"
                >
                  <span>🏫 مدیر و معلمان</span>
                  <span className={styles.chatPillCount}>{staffConversations.length}</span>
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
              </div>

              <div className={styles.contactList}>
                {loading ? (
                  <div style={{ textAlign: 'center', padding: '30px 0' }}>
                    <div className="spinner" style={{ margin: '0 auto' }}></div>
                  </div>
                ) : displayedConversations.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-tertiary)' }}>
                    گفتگویی در این بخش یافت نشد. با وارد کردن <strong>@نام‌کاربری</strong> در کادر جستجو یا از تب <strong>«لیست مخاطبین»</strong> گفتگو را شروع کنید.
                  </div>
                ) : chatRoleFilter === 'all' ? (
                  <>
                    {staffConversations.length > 0 && (
                      <>
                        <div className={styles.categorySectionHeader} style={{ color: '#a5b4fc' }}>
                          <div className={styles.categorySectionTitle}>
                            <span>🏫 مدیر و معلمان مدرسه (مخاطبین پیش‌فرض)</span>
                          </div>
                          <span className={styles.categorySectionBadge} style={{ background: 'rgba(99, 102, 241, 0.2)', color: '#a5b4fc' }}>
                            {staffConversations.length} نفر
                          </span>
                        </div>
                        {staffConversations.map(renderConversationItem)}
                      </>
                    )}

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
                <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>گروه‌ها و کانال‌ها</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.75rem', padding: '5px 9px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => {
                      setJoinLinkInput('');
                      setShowJoinGroupModal(true);
                    }}
                    title="عضویت در گروه با لینک، کد دعوت یا @آیدی"
                  >
                    <HiOutlineLink />
                    <span>پیوستن با لینک/آیدی</span>
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
                    data-testid="open-create-group-btn"
                  >
                    <HiOutlinePlus />
                    <span>گروه جدید</span>
                  </button>
                </div>
              </div>

              {/* Group Search by @handle / Invite Link / Code / Name */}
              <div className={styles.searchBox}>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="input"
                    style={{ paddingRight: '36px', fontSize: '0.8125rem' }}
                    placeholder="جستجوی گروه با @آیدی، لینک، کد یا نام..."
                    value={groupSearchQuery}
                    onChange={(e) => setGroupSearchQuery(e.target.value)}
                    data-testid="group-search-input"
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

              {groupSearchQuery.trim().length >= 2 && (
                <div className={styles.liveSearchSection} data-testid="group-search-results">
                  <div className={styles.liveSearchHeader}>
                    <span>🔎 گروه‌های یافت‌شده در مدرسه</span>
                    {searchingGroups && <span>در حال جستجو...</span>}
                  </div>
                  {!searchingGroups && groupSearchResults.length === 0 ? (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      گروهی با این آیدی یا لینک یافت نشد.
                    </span>
                  ) : (
                    groupSearchResults.map((g) => (
                      <div key={g.id} className={styles.liveSearchResultItem} style={{ cursor: 'default' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                          <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {g.name}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {g.group_handle && (
                              <span className={styles.groupHandleBadge}>@{g.group_handle}</span>
                            )}
                            <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
                              {g.members_count || 1} عضو
                            </span>
                          </div>
                        </div>
                        {g.is_member ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.72rem', padding: '4px 10px', flexShrink: 0 }}
                            onClick={() => {
                              setGroupSearchQuery('');
                              setGroupSearchResults([]);
                              selectGroup(g);
                            }}
                          >
                            ورود به گروه
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            style={{ fontSize: '0.72rem', padding: '4px 10px', flexShrink: 0 }}
                            disabled={joiningGroupId === g.id}
                            onClick={() => handleJoinGroupByLink(g.group_handle ? `@${g.group_handle}` : g.invite_code, g.id)}
                          >
                            {joiningGroupId === g.id ? 'در حال عضویت...' : '+ عضویت در گروه'}
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              <div className={styles.contactList}>
                {groups.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>
                    هنوز در هیچ گروهی عضو نیستید. می‌توانید گروه جدید بسازید یا با <strong>@آیدی یا لینک گروه</strong> در آن عضو شوید.
                  </div>
                ) : (
                  groups.map((grp) => {
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
                          <div className={styles.contactNameRow} style={{ gap: '6px', flexWrap: 'wrap' }}>
                            <span className={styles.contactName}>{grp.name}</span>
                            {grp.group_handle && (
                              <span className={styles.groupHandleBadge}>@{grp.group_handle}</span>
                            )}
                            <span className={styles.contactCodePill}>{grp.members_count || 1} عضو</span>
                          </div>
                          <span className={styles.lastMsgPreview}>
                            {grp.last_message
                              ? `${grp.last_message.sender_name}: ${getLastMsgPreviewText(grp.last_message)}`
                              : grp.description || 'کانال رسمی مدرسه'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {/* TAB 3: School Contacts Directory */}
          {activeTab === 'directory' && (
            <>
              <div className={styles.searchBox}>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="input"
                    style={{ paddingRight: '36px', fontSize: '0.8125rem' }}
                    placeholder="جستجو با @نام‌کاربری، نام یا کد..."
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
                  🏫 مدیر و معلمان ({directory.staff?.length || 0})
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
                  const isPrincipal = Boolean(person.is_principal || person.role === 'admin' || person.role === 'manager');
                  const badge = getRoleBadge(person.role, person);
                  return (
                    <div key={person.id} className={styles.dirCard}>
                      <div className={styles.dirCardHeader}>
                        <div
                          className="avatar"
                          style={{
                            width: '38px',
                            height: '38px',
                            background: isPrincipal
                              ? 'linear-gradient(135deg, #b45309, #f59e0b)'
                              : person.role === 'student'
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
                            {person.job_title ||
                              (person.is_principal || ['admin', 'manager', 'principal'].includes(person.role)
                                ? 'مدیریت مدرسه'
                                : person.role === 'teacher'
                                ? 'کادر آموزشی'
                                : person.role === 'student'
                                ? 'دانش‌آموز'
                                : 'اولیا و خانواده')}
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
        <div className={`${styles.chatArea} ${!isChatSelected ? styles.chatAreaHiddenMobile : ''}`}>
          {activeGroup ? (
            /* GROUP CHAT VIEW */
            <>
              <div className={styles.chatHeader}>
                <div className={styles.chatPartnerInfo}>
                  <button
                    type="button"
                    className={styles.mobileBackBtn}
                    onClick={() => {
                      setActiveGroup(null);
                      setActivePartner(null);
                    }}
                    title="بازگشت به لیست گفتگوها"
                  >
                    <HiOutlineArrowRight />
                  </button>
                  <div className={styles.groupAvatar} style={{ width: '40px', height: '40px', minWidth: '40px', fontSize: '1.2rem' }}>
                    {activeGroup.category === 'council' ? '🏛️' : activeGroup.category === 'parents' ? '🤝' : '🏆'}
                  </div>
                  <div style={{ minWidth: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {activeGroup.name}
                      </h3>
                      {activeGroup.group_handle && (
                        <span
                          className={styles.groupHandleBadge}
                          title="آیدی قابل جستجوی گروه (کلیک جهت کپی)"
                          onClick={() => handleCopyGroupHandle(activeGroup.group_handle)}
                        >
                          @{activeGroup.group_handle}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
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
                  {(activeGroup.is_admin || activeGroup.created_by === user?.id || user?.role === 'admin' || user?.role === 'manager') && (
                    <button
                      type="button"
                      className={styles.callToolBtn}
                      style={{ color: '#ef4444' }}
                      onClick={() => handleDeleteGroup(activeGroup)}
                      title="حذف گروه"
                    >
                      <HiOutlineTrash />
                      <span>حذف گروه</span>
                    </button>
                  )}
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
                            {msg.content && String(msg.content).trim() ? <p>{msg.content}</p> : null}

                            <MessageAttachments
                              attachments={parseAttachments(msg.attachments)}
                              styles={styles}
                              onPreviewImage={setLightboxImage}
                            />

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
              <MessageComposer
                styles={styles}
                editingMessage={editingMessage}
                cancelEditing={cancelEditing}
                attachedFiles={attachedFiles}
                removeAttachment={removeAttachment}
                isRecording={isRecording}
                recordingDuration={recordingDuration}
                formatDuration={formatDuration}
                cancelRecording={cancelRecording}
                stopAndSendRecording={stopAndSendRecording}
                isUploadingVoice={isUploadingVoice}
                uploadingFile={uploadingFile}
                startRecording={startRecording}
                onUploadFiles={handleFileUpload}
                newMessageText={newMessageText}
                setNewMessageText={setNewMessageText}
                onSubmit={handleSendMessage}
                sending={sending}
                placeholder={`ارسال پیام، عکس، ویدیو یا ویس به گروه ${activeGroup.name}...`}
                recordingHint="در حال ضبط ویس گروه..."
              />
            </>
          ) : activePartner ? (
            /* 1-on-1 CHAT VIEW */
            <>
              <div className={styles.chatHeader}>
                <div className={styles.chatPartnerInfo}>
                  <button
                    type="button"
                    className={styles.mobileBackBtn}
                    onClick={() => {
                      setActiveGroup(null);
                      setActivePartner(null);
                    }}
                    title="بازگشت به مخاطبین"
                  >
                    <HiOutlineArrowRight />
                  </button>
                  {(() => {
                    const isPrincipal = Boolean(activePartner.is_principal || activePartner.role === 'admin' || activePartner.role === 'manager');
                    const badge = getRoleBadge(activePartner.role, activePartner);
                    return (
                      <>
                        <div
                          className="avatar"
                          style={{
                            width: '40px',
                            height: '40px',
                            minWidth: '40px',
                            background: isPrincipal
                              ? 'linear-gradient(135deg, #b45309, #f59e0b)'
                              : activePartner.role === 'student'
                              ? 'linear-gradient(135deg, #059669, #10b981)'
                              : activePartner.role === 'parent'
                              ? 'linear-gradient(135deg, #d97706, #f59e0b)'
                              : 'linear-gradient(135deg, #4f46e5, #6366f1)',
                            color: '#ffffff',
                          }}
                        >
                          {activePartner.display_name?.charAt(0)}
                        </div>
                        <div style={{ minWidth: 0, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 800 }}>{activePartner.display_name}</h3>
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
                              fontSize: '0.72rem',
                              color:
                                activePartner.role === 'student'
                                  ? '#34d399'
                                  : activePartner.role === 'parent'
                                  ? '#fbbf24'
                                  : '#a5b4fc',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: 'block',
                            }}
                          >
                            {activePartner.role === 'parent'
                              ? `🎓 اولیا و خانواده • فرزند: ${activePartner.student_name || 'دانش‌آموز مدرسه'} ${activePartner.student_department ? `(${activePartner.student_department})` : ''}`
                              : activePartner.is_principal || ['admin', 'manager', 'principal'].includes(activePartner.role)
                              ? 'مدیریت مدرسه'
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
                            {msg.content && String(msg.content).trim() ? <p>{msg.content}</p> : null}

                            <MessageAttachments
                              attachments={parseAttachments(msg.attachments)}
                              styles={styles}
                              onPreviewImage={setLightboxImage}
                            />

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
              <MessageComposer
                styles={styles}
                editingMessage={editingMessage}
                cancelEditing={cancelEditing}
                attachedFiles={attachedFiles}
                removeAttachment={removeAttachment}
                isRecording={isRecording}
                recordingDuration={recordingDuration}
                formatDuration={formatDuration}
                cancelRecording={cancelRecording}
                stopAndSendRecording={stopAndSendRecording}
                isUploadingVoice={isUploadingVoice}
                uploadingFile={uploadingFile}
                startRecording={startRecording}
                onUploadFiles={handleFileUpload}
                newMessageText={newMessageText}
                setNewMessageText={setNewMessageText}
                onSubmit={handleSendMessage}
                sending={sending}
                placeholder={`ارسال پیام، عکس، ویدیو یا ویس به ${activePartner.display_name}...`}
                recordingHint="در حال ضبط پیام صوتی (ویس)..."
              />
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
                  data-testid="create-group-name-input"
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                  آیدی قابل جستجوی گروه (اختیاری)
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  placeholder="مثلاً: math_10a (در صورت خالی بودن خودکار ساخته می‌شود)"
                  value={newGroupForm.group_handle}
                  onChange={(e) => setNewGroupForm({ ...newGroupForm, group_handle: e.target.value })}
                  data-testid="create-group-handle-input"
                />
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>دسته‌بندی گروه</label>
                <select
                  className="input"
                  value={newGroupForm.category}
                  onChange={(e) => setNewGroupForm({ ...newGroupForm, category: e.target.value })}
                >
                  <option value="council">🏛️ شورای دبیران و کادر مدرسه</option>
                  <option value="class">📚 کلاس درسی و آموزشی</option>
                  <option value="olympiad">🏆 کارگروه مسابقات و المپیاد</option>
                  <option value="parents">🤝 انجمن اولیاء و مربیان</option>
                  <option value="general">📢 کانال اطلاع‌رسانی عمومی</option>
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
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (createGroupMemberInput.trim()) {
                          handleSearchUsers(createGroupMemberInput, 'create');
                        }
                      }
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

                {createGroupMemberInput.trim().length > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: '6px', fontSize: '0.78rem' }}
                    onClick={() => {
                      const raw = createGroupMemberInput.trim();
                      handleAddMemberToCreateList({
                        id: raw.replace(/^@/, ''),
                        display_name: raw,
                        username: raw.replace(/^@/, ''),
                        role: 'member',
                      });
                    }}
                  >
                    + افزودن مستقیم «{createGroupMemberInput.trim()}» به لیست اعضا
                  </button>
                )}

                {/* Quick Directory Picker toggle */}
                <div style={{ marginTop: '10px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.8rem' }}
                    onClick={() => setShowDirectoryPickerInCreate(!showDirectoryPickerInCreate)}
                  >
                    <HiOutlineUserGroup />
                    <span>{showDirectoryPickerInCreate ? 'بستن لیست مخاطبین مدرسه ▲' : 'انتخاب سریع از دفترچه مخاطبین مدرسه ▼'}</span>
                  </button>

                  {showDirectoryPickerInCreate && (
                    <div style={{ marginTop: '8px', padding: '10px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className={`btn btn-sm ${createGroupDirFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ padding: '3px 7px', fontSize: '0.72rem' }}
                          onClick={() => setCreateGroupDirFilter('all')}
                        >
                          همه ({directory.all?.length || 0})
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${createGroupDirFilter === 'staff' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ padding: '3px 7px', fontSize: '0.72rem' }}
                          onClick={() => setCreateGroupDirFilter('staff')}
                        >
                          دبیران و کادر ({directory.staff?.length || 0})
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${createGroupDirFilter === 'students' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ padding: '3px 7px', fontSize: '0.72rem' }}
                          onClick={() => setCreateGroupDirFilter('students')}
                        >
                          دانش‌آموزان ({directory.students?.length || 0})
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${createGroupDirFilter === 'parents' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ padding: '3px 7px', fontSize: '0.72rem' }}
                          onClick={() => setCreateGroupDirFilter('parents')}
                        >
                          اولیاء ({directory.parents?.length || 0})
                        </button>
                      </div>

                      <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {((createGroupDirFilter === 'staff' ? directory.staff : createGroupDirFilter === 'students' ? directory.students : createGroupDirFilter === 'parents' ? directory.parents : directory.all) || []).map((u) => {
                          const isAdded = createGroupMembers.some((m) => m.id === u.id);
                          return (
                            <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.78rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                                <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.display_name}</span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>({u.job_title || u.role})</span>
                              </div>
                              <button
                                type="button"
                                className={`btn btn-sm ${isAdded ? 'btn-secondary' : 'btn-primary'}`}
                                style={{ padding: '2px 8px', fontSize: '0.72rem', flexShrink: 0 }}
                                disabled={isAdded}
                                onClick={() => handleAddMemberToCreateList(u)}
                              >
                                {isAdded ? 'اضافه شد ✓' : '+ افزودن'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
                            (@{m.username || m.identifier_code || m.id})
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
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  disabled={creatingGroup}
                >
                  {creatingGroup ? (
                    <span>در حال ایجاد گروه...</span>
                  ) : (
                    <>
                      <HiOutlinePlus />
                      <span>تأیید و ساخت گروه</span>
                    </>
                  )}
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
              اعضای مدرسه می‌توانند با جستجوی <strong>آیدی گروه</strong>، <strong>لینک دعوت</strong> یا <strong>کد عضویت</strong> به این گروه بپیوندند:
            </p>

            <div className={styles.inviteLinkCard}>
              {activeGroup.group_handle && (
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
                    آیدی قابل جستجوی گروه:
                  </label>
                  <div className={styles.inviteCodeBadgeBox}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>آیدی:</span>
                      <span className={styles.inviteCodeText} style={{ direction: 'ltr' }}>
                        @{activeGroup.group_handle}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                      onClick={() => handleCopyGroupHandle(activeGroup.group_handle)}
                    >
                      {copiedHandle ? 'کپی شد ✓' : 'کپی آیدی'}
                    </button>
                  </div>
                </div>
              )}

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

      {/* Modal 3: Join Group By Link / Code / @Handle Modal */}
      {showJoinGroupModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowJoinGroupModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.25rem' }}>🚪</span>
                <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, margin: 0 }}>
                  پیوستن به گروه با آیدی، لینک یا کد دعوت
                </h2>
              </div>
              <button className={styles.closeBtn} onClick={() => setShowJoinGroupModal(false)}>
                &times;
              </button>
            </div>

            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: '1.6' }}>
              آیدی گروه (مثلاً <code>@math_10a</code>)، لینک دعوت یا کد عضویت (مثلاً <code>GRP-XXXX</code>) را در کادر زیر وارد نمایید:
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
                  placeholder="@آیدی گروه، لینک دعوت یا کد اختصاصی..."
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

      {/* Image Lightbox Modal */}
      {lightboxImage && (
        <div
          className={styles.lightboxBackdrop}
          onClick={() => setLightboxImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label="پیش‌نمایش تصویر"
        >
          <img
            src={lightboxImage.url}
            alt={lightboxImage.title || 'تصویر'}
            className={styles.lightboxImg}
            onClick={(e) => e.stopPropagation()}
          />
          <div className={styles.lightboxBar} onClick={(e) => e.stopPropagation()}>
            <span>{lightboxImage.title || 'تصویر'}</span>
            <a
              href={lightboxImage.url}
              download={lightboxImage.title || 'image'}
              className="btn btn-primary btn-sm"
            >
              دانلود تصویر
            </a>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setLightboxImage(null)}
            >
              بستن
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
