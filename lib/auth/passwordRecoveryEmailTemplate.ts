/**
 * Template oficial “Reset password” do GoTrue (DEVELOP).
 * Usa somente {{ .ConfirmationURL }} — nunca montar token manualmente.
 * Não aplicar em Production sem autorização.
 */

export const PASSWORD_RECOVERY_EMAIL_SUBJECT = 'Recuperação de senha — SV Lotes';

export const PASSWORD_RECOVERY_EMAIL_CONFIRMATION_VAR = '{{ .ConfirmationURL }}';

export const PASSWORD_RECOVERY_EMAIL_TEXT = `Recuperação de acesso ao SV Lotes

Recebemos uma solicitação para redefinir a senha da sua conta.

Clique no link abaixo para criar uma nova senha:
${PASSWORD_RECOVERY_EMAIL_CONFIRMATION_VAR}

Se você não solicitou esta alteração, ignore este e-mail. Sua senha atual continuará válida.

Por segurança, o link de recuperação é temporário e não poderá ser reutilizado após a alteração da senha.

SV Lotes — Gestão Imobiliária e GIS
`;

export const PASSWORD_RECOVERY_EMAIL_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Recuperação de senha — SV Lotes</title>
  </head>
  <body style="margin:0;padding:0;background-color:#0B1121;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#0B1121;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#151B2B;border:1px solid #243049;border-radius:16px;">
            <tr>
              <td style="padding:28px 28px 8px 28px;text-align:center;">
                <p style="margin:0;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#F27D26;font-weight:700;">SV Lotes</p>
                <h1 style="margin:12px 0 0 0;font-size:22px;line-height:1.3;color:#FFFFFF;">Recuperação de acesso ao SV Lotes</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 8px 28px;color:#C5CDD8;font-size:15px;line-height:1.6;">
                <p style="margin:0 0 14px 0;">Recebemos uma solicitação para redefinir a senha da sua conta.</p>
                <p style="margin:0 0 22px 0;">Clique no botão abaixo para criar uma nova senha:</p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                  <tr>
                    <td align="center" bgcolor="#F27D26" style="border-radius:10px;">
                      <a href="${PASSWORD_RECOVERY_EMAIL_CONFIRMATION_VAR}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;">Redefinir minha senha</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:22px 0 0 0;font-size:13px;line-height:1.6;color:#9AA6B5;">Se o botão não funcionar, copie e cole este link no navegador:</p>
                <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;word-break:break-all;color:#F27D26;">
                  <a href="${PASSWORD_RECOVERY_EMAIL_CONFIRMATION_VAR}" style="color:#F27D26;text-decoration:underline;">${PASSWORD_RECOVERY_EMAIL_CONFIRMATION_VAR}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 28px 28px;color:#9AA6B5;font-size:13px;line-height:1.6;">
                <p style="margin:0 0 10px 0;">Se você não solicitou esta alteração, ignore este e-mail. Sua senha atual continuará válida.</p>
                <p style="margin:0;">Por segurança, o link de recuperação é temporário e não poderá ser reutilizado após a alteração da senha.</p>
              </td>
            </tr>
          </table>
          <p style="margin:18px 0 0 0;font-size:12px;color:#7B8796;">SV Lotes — Gestão Imobiliária e GIS</p>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

export function passwordRecoveryEmailUsesOfficialConfirmationUrl(source: string): boolean {
  return source.includes(PASSWORD_RECOVERY_EMAIL_CONFIRMATION_VAR) && !/\{\{\s*\.Token/.test(source);
}
