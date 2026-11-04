-- 산업안전보건교육을 교육 과정 목록의 마지막에 표시합니다.
UPDATE training_courses
SET sort_order = (SELECT MAX(sort_order) + 1 FROM training_courses)
WHERE code = 'safety';
