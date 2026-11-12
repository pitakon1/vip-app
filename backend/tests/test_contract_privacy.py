"""C-03B 脱敏口径单测：手机号 11 位 / 非 11 位 / 空值，姓名两字 / 单字。"""
from app.services.contract_privacy import mask_person_name, mask_phone


def test_mask_phone_eleven_digits():
    assert mask_phone("13812341234") == "138****1234"
    # 带分隔符也按纯数字口径处理
    assert mask_phone("138-1234-1234") == "138****1234"


def test_mask_phone_non_eleven_digits():
    # 12 位座机 / 其它长度只留后 4 位；带区号的 11 位仍走「前 3 后 4」规则
    assert mask_phone("0755-88886666") == "****6666"
    assert mask_phone("+85291234567") == "852****4567"


def test_mask_phone_empty():
    assert mask_phone(None) is None
    assert mask_phone("") is None
    assert mask_phone("   ") is None


def test_mask_person_name():
    assert mask_person_name("张伟") == "张*"
    assert mask_person_name("欧阳娜娜") == "欧**娜"
    assert mask_person_name("李") == "李"
    assert mask_person_name("") == "*"
    assert mask_person_name(None) == "*"
