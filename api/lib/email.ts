import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_KEY);

export const sendEmailVerification = async (email: string, token: string) => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

  try {
    const { data, error } = await resend.emails.send({
      from: "OpenBirding.org <noreply@system.openbirding.org>",
      to: [email],
      replyTo: "adam@openbirding.org",
      subject: "Verify your email address",
      html: `
        <p>Welcome to OpenBirding.org!</p>
        
        <p>Please verify your email address by clicking the link below:</p>
        
        <p><a href="${verificationUrl}">${verificationUrl}</a></p>
        
        <p>If you didn't create an OpenBirding.org account, you can safely ignore this email.</p>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      throw new Error("Failed to send verification email");
    }

    return data;
  } catch (error) {
    console.error("Email sending error:", error);
    throw new Error("Failed to send verification email");
  }
};
