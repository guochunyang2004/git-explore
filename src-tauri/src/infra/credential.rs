//! 凭证管理（对应架构文档附录 D 认证流程）
//!
//! 使用系统 keychain 存储远端凭证。
//! 按 host 维度存储，同 host 多仓库共享；支持仓库级覆盖。

use crate::infra::error::AppResult;
use keyring::Entry;

const SERVICE_NAME: &str = "GitExplore";

/// 凭证信息
#[derive(Debug, Clone)]
pub struct Credential {
    pub host: String,
    pub username: String,
    pub token: String,
}

/// 凭证管理器
pub struct CredentialManager;

impl CredentialManager {
    /// 存储凭证到 keychain（host 维度）
    pub fn set(host: &str, username: &str, token: &str) -> AppResult<()> {
        let entry = Entry::new(SERVICE_NAME, host)
            .map_err(|e| crate::infra::error::AppError::new(
                crate::infra::error::ErrorCode::Internal,
                "errors.internal",
                &e.to_string(),
            ))?;
        let payload = format!("{}:{}", username, token);
        entry.set_password(&payload).map_err(|e| {
            crate::infra::error::AppError::new(
                crate::infra::error::ErrorCode::Internal,
                "errors.internal",
                &e.to_string(),
            )
        })?;
        Ok(())
    }

    /// 获取 host 对应凭证
    pub fn get(host: &str) -> AppResult<Option<Credential>> {
        let entry = match Entry::new(SERVICE_NAME, host) {
            Ok(e) => e,
            Err(_) => return Ok(None),
        };
        match entry.get_password() {
            Ok(payload) => {
                // payload 格式 "username:token"
                if let Some((username, token)) = payload.split_once(':') {
                    Ok(Some(Credential {
                        host: host.to_string(),
                        username: username.to_string(),
                        token: token.to_string(),
                    }))
                } else {
                    Ok(None)
                }
            }
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Ok(None),
        }
    }

    /// 删除凭证
    pub fn delete(host: &str) -> AppResult<()> {
        if let Ok(entry) = Entry::new(SERVICE_NAME, host) {
            let _ = entry.delete_credential();
        }
        Ok(())
    }
}
