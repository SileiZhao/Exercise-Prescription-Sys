from enum import Enum


class UserRole(str, Enum):
    USER = "USER"
    EXPERT = "EXPERT"
    ADMIN = "ADMIN"
    RESEARCHER = "RESEARCHER"
    ORG_ADMIN = "ORG_ADMIN"


class OrganizationType(str, Enum):
    SCHOOL = "SCHOOL"
    COMMUNITY = "COMMUNITY"
    HOSPITAL = "HOSPITAL"
    GYM = "GYM"
    ENTERPRISE = "ENTERPRISE"
    OTHER = "OTHER"
