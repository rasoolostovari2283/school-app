const crypto = require('crypto');
const db = require('../../config/database');
const { v4: uuidv4 } = require('uuid');

class ExternalLiveService {
  /**
   * Update live provider settings for a class
   */
  async updateLiveSettings(classId, settings) {
    const {
      live_provider,
      skyroom_url,
      skyroom_api_key,
      bbb_server_url,
      bbb_secret,
      bbb_meeting_id,
    } = settings;

    await db('classes')
      .where({ id: classId })
      .update({
        live_provider: live_provider || 'native',
        skyroom_url: skyroom_url ? skyroom_url.trim() : null,
        skyroom_api_key: skyroom_api_key ? skyroom_api_key.trim() : null,
        bbb_server_url: bbb_server_url ? bbb_server_url.trim() : null,
        bbb_secret: bbb_secret ? bbb_secret.trim() : null,
        bbb_meeting_id: bbb_meeting_id ? bbb_meeting_id.trim() : null,
        updated_at: db.fn.now(),
      });

    return await db('classes').where({ id: classId }).first();
  }

  /**
   * Generate launch/join URL for student or teacher
   */
  async generateJoinUrl(classId, user) {
    const cls = await db('classes').where({ id: classId }).first();
    if (!cls) throw new Error('کلاس یافت نشد');

    const provider = cls.live_provider || 'native';
    const isTeacher = user.role === 'teacher';
    const userName = user.full_name || user.name || (isTeacher ? 'دبیر کلاس' : 'دانش‌آموز');

    if (provider === 'skyroom') {
      let roomUrl = cls.skyroom_url;
      if (!roomUrl) {
        return {
          provider: 'native',
          joinUrl: `/dashboard/classes/${classId}/live`,
          roomTitle: cls.name,
          target: '_self',
        };
      }

      // If user provided a basic URL, we can append user display params if applicable
      const parsedUrl = new URL(roomUrl.startsWith('http') ? roomUrl : `https://${roomUrl}`);
      // Skyroom guest or login URL
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

      // BBB Checksum calculation helper (SHA1)
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

    // Default: native in-app live classroom
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
  async syncExternalRecording(classId, teacherId, data) {
    const cls = await db('classes').where({ id: classId }).first();
    if (!cls) throw new Error('کلاس یافت نشد');

    const {
      title,
      recording_url,
      source_platform = 'skyroom', // 'skyroom' | 'bigbluebutton'
      duration_seconds = 0,
      description = '',
      pdf_url = null,
      pdf_name = null,
    } = data;

    if (!recording_url || !recording_url.trim()) {
      throw new Error('آدرس لینک ویدیو ضبط‌شده الزامی است');
    }

    const videoTitle = title && title.trim() 
      ? title.trim() 
      : `جلسه آنلاین ${source_platform === 'skyroom' ? 'اسکای‌روم' : 'بیگ‌بلو‌باتن'} — ${cls.name}`;

    const videoId = uuidv4();

    // Ensure video folder for this class exists
    const folderName = `کلاس ${cls.name}`;
    let folder = await db('video_folders').where({ name: folderName }).first();
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
