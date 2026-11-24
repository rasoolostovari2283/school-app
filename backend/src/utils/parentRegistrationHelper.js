/**
 * Pure domain helpers for Parent Registration validation & relation rules
 */

const PARENT_RELATION_OPTIONS = ['پدر', 'مادر', 'سایر موارد'];

function validateParentRelation({ relation_type = '', relation = '', custom_relation = '' }) {
  const rawType = String(relation_type || '').trim().toLowerCase();
  const rawRelation = String(relation || '').trim();
  const rawCustom = String(custom_relation || '').trim();

  if (rawType === 'father' || rawRelation === 'پدر') {
    return {
      valid: true,
      relation_type: 'father',
      relation: 'پدر',
      jobTitle: 'پدر دانش‌آموز',
    };
  }

  if (rawType === 'mother' || rawRelation === 'مادر') {
    return {
      valid: true,
      relation_type: 'mother',
      relation: 'مادر',
      jobTitle: 'مادر دانش‌آموز',
    };
  }

  if (rawType === 'other' || rawRelation === 'سایر موارد' || rawCustom) {
    const finalCustom = rawCustom || (rawRelation !== 'سایر موارد' ? rawRelation : '');
    if (!finalCustom || finalCustom.length < 2) {
      return {
        valid: false,
        error: 'در صورت انتخاب «سایر موارد»، لطفاً نسبت خود با دانش‌آموز را بنویسید و ثبت کنید.',
      };
    }
    if (finalCustom.length > 60) {
      return {
        valid: false,
        error: 'عنوان نسبت با دانش‌آموز نباید بیشتر از ۶۰ کاراکتر باشد.',
      };
    }
    return {
      valid: true,
      relation_type: 'other',
      relation: finalCustom,
      jobTitle: `${finalCustom} دانش‌آموز`,
    };
  }

  if (rawRelation.length >= 2) {
    return {
      valid: true,
      relation_type: 'other',
      relation: rawRelation.slice(0, 60),
      jobTitle: `${rawRelation.slice(0, 60)} دانش‌آموز`,
    };
  }

  return {
    valid: false,
    error: 'لطفاً نسبت خود با دانش‌آموز (پدر، مادر یا سایر موارد) را مشخص کنید.',
  };
}

module.exports = {
  PARENT_RELATION_OPTIONS,
  validateParentRelation,
};
