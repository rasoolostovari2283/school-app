const express = require('express');
const router = express.Router({ mergeParams: true });
const messageController = require('./message.controller');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);

// Directory of school personnel, students, and parents
router.get('/directory', messageController.getDirectory);
router.get('/users/search', messageController.searchUserByIdentifier);

// Group Chats
router.get('/groups', messageController.getGroups);
router.post('/groups', messageController.createGroup);
router.delete('/groups/:groupId', messageController.deleteGroup);
router.post('/groups/join', messageController.joinGroupByLinkOrCode);
router.get('/groups/:groupId/members', messageController.getGroupMembers);
router.post('/groups/:groupId/members', messageController.addMemberToGroup);
router.get('/groups/:groupId/invite-link', messageController.getGroupInviteLink);
router.get('/groups/:groupId/messages', messageController.getGroupMessages);
router.post('/groups/:groupId/messages', messageController.sendGroupMessage);
router.put('/groups/:groupId/messages/:messageId', messageController.editGroupMessage);
router.delete('/groups/:groupId/messages/:messageId', messageController.deleteGroupMessage);

// In-app Audio / Video Calling
router.post('/calls/initiate', messageController.initiateCall);
router.post('/calls/:id/end', messageController.endCall);

// 1-on-1 Messages & Broadcasts
router.post('/', messageController.send);
router.post('/broadcast', authorize('teacher'), messageController.broadcast);
router.get('/conversations', messageController.getConversations);
router.get('/conversations/:id', messageController.getMessages);
router.put('/:id', messageController.editMessage);
router.delete('/:id', messageController.deleteMessage);

module.exports = router;
