const crypto = require('crypto');
const db = require('../../config/database');
const { v4: uuidv4 } = require('uuid');
const { assertOwnsClass, isSchoolAdmin } = require('../../middleware/auth');

function redactSecrets(cls) {
  if (!cls) return cls;
  const copy = { ...cls };
  delete copy.skyroom_api_key;
  delete copy.bbb_secret;
  return copy;
}

function validateExternalUrl(rawUrl, label = 'URL') {
  if (!rawUrl || !String(rawUrl).trim()) return null;
  const trimmed = String(rawUrl).trim();
  let parsed;
  try {
    parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    const err = new Error(`آدرس ${label} نامعتبر است`);
    err.statusCode = 400;
    throw err;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    const err = new Error(`پروتکل ${label} نامعتبر است`);
    err.statusCode = 400;
    throw err;
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    const err = new Error(`آدرس داخلی یا لوپ‌بک برای ${label} مجاز نیست`);
    err.statusCode = 400;
    throw err;
  }

  return trimmed;
}

class ExternalLiveService {
  /**
   * Update live provider settings for a class (requires class ownership)
   */
  async updateLiveSettings(classId, actor, settings) {
    await assertOwnsClass(actor, classId);

    const {
      live_provider,
      skyroom_url,
      skyroom_api_key,
      bbb_server_url,
      bbb_secret,
      bbb_meeting_id,
    } = settings;

    const validSkyroomUrl = validateExternalUrl(skyroom_url, 'Skyroom');
    const validBbbUrl = validateExternalUrl(bbb_server_url, 'BigBlueButton');

    await db('classes')
      .where({ id: classId })
      .update({
        live_provider: live_provider || 'native',
        skyroom_url: validSkyroomUrl,
        skyroom_api_key: skyroom_api_key ? skyroom_api_key.trim() : null,
        bbb_server_url: validBbbUrl,
        bbb_secret: bbb_secret ? bbb_secret.trim() : null,
        bbb_meeting_id: bbb_meeting_id ? bbb_meeting_id.trim() : null,
        updated_at: db.fn.now(),
      });

    const updated = await db('classes').where({ id: classId }).first();
    return redactSecrets(updated);
  }

  /**
   * Generate launch/join URL for student or teacher
   */
  async generateJoinUrl(classId, user) {
    const cls = await assertOwnsClass(user, classId, { allowEnrolled: true });

    const provider = cls.live_provider || 'native';
    const isTeacher = user.role === 'teacher' || isSchoolAdmin(user);
    const userName = user.display_name || user.full_name || user.name || (isTeacher ? 'دبیر کلاس' : 'دانش‌آموز');

    if (provider === 'skyroom') {
      const roomUrl = cls.skyroom_url;
      if (!roomUrl) {
        return {
          provider: 'native',
          joinUrl: `/dashboard/classes/${classId}/live`,
          roomTitle: cls.name,
          target: '_self',
        };
      }

      const parsedUrl = new URL(roomUrl.startsWith('http') ? roomUrl : `https://${roomUrl}`);
      return {
        provider: 'skyroom',
        joinUrl: parsedUrl.toString(),
        roomTitle: cls.name,
        target: '_blank',
      };
    }

    if (provider === 'bigbluebutton') {
      const serverUrl = cls.bbb_server_url?.replace(/\/$/, '');
      const secret = cls.bbb_secret;
      const meetingId = cls.bbb_meeting_id || `class_${cls.id}`;

      if (!serverUrl || !secret) {
        return {
          provider: 'native',
          joinUrl: `/dashboard/classes/${classId}/live`,
          roomTitle: cls.name,
          target: '_self',
        };
      }

      const pw = isTeacher ? 'mp' : 'ap';
      const call = 'join';
      const queryParams = `fullName=${encodeURIComponent(userName)}&meetingID=${encodeURIComponent(meetingId)}&password=${pw}&redirect=true`;
      const strToHash = `${call}${queryParams}${secret}`;
      const checksum = crypto.createHash('sha1').update(strToHash).digest('hex');

      const joinUrl = `${serverUrl}/api/${call}?${queryParams}&checksum=${checksum}`;

      return {
        provider: 'bigbluebutton',
        joinUrl,
        roomTitle: cls.name,
        target: '_blank',
      };
    }

    return {
      provider: 'native',
      joinUrl: `/dashboard/classes/${classId}/live`,
      roomTitle: cls.name,
      target: '_self',
    };
  }

  /**
   * Sync / Import an external recorded video (from Skyroom or BigBlueButton) into the class video archive
   */
  async syncExternalRecording(classId, actor, data) {
    const cls = await assertOwnsClass(actor, classId);
    const teacherId = actor.id;

    const {
      title,
      recording_url,
      source_platform = 'skyroom',
      duration_seconds = 0,
      description = '',
      pdf_url = null,
      pdf_name = null,
    } = data;

    if (!recording_url || !recording_url.trim()) {
      const err = new Error('آدرس لینک ویدیو ضبط‌شده الزامی است');
      err.statusCode = 400;
      throw err;
    }

    const videoTitle = title && title.trim()
      ? title.trim()
      : `جلسه آنلاین ${source_platform === 'skyroom' ? 'اسکای‌روم' : 'بیگ‌بلو‌باتن'} — ${cls.name}`;

    const videoId = uuidv4();

    const folderName = `کلاس ${cls.name}`;
    let folder = await db('video_folders').where({ name: folderName, class_id: classId }).first();
    if (!folder) {
      const folderId = uuidv4();
      await db('video_folders').insert({
        id: folderId,
        name: folderName,
        teacher_id: teacherId,
        class_id: classId,
        created_at: db.fn.now(),
      });
    }

    await db('videos').insert({
      id: videoId,
      title: videoTitle,
      description: description || `ویدیو ضبط‌شده جلسه آنلاین از بستر ${source_platform === 'skyroom' ? 'اسکای‌روم (Skyroom)' : 'بیگ‌بلو‌باتن (BigBlueButton)'}`,
      class_id: classId,
      teacher_id: teacherId,
      file_url: recording_url.trim(),
      video_url: recording_url.trim(),
      source_platform,
      duration_seconds: parseInt(duration_seconds, 10) || 0,
      is_published: true,
      pdf_url: pdf_url || null,
      pdf_name: pdf_name || null,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    const savedVideo = await db('videos').where({ id: videoId }).first();
    return savedVideo;
  }
}

module.exports = new ExternalLiveService();
