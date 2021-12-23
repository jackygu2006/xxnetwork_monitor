import nodemailer from 'nodemailer'
import dotenv from 'dotenv';

dotenv.config();
const smtpUsername = process.env.smtpUsername;
const smtpPassword = process.env.smtpPassword;

const transporter = nodemailer.createTransport({
	host: process.env.smtpHost,
	port: process.env.smtpPort,
	secure: false, // true for 465, false for other ports
	auth: {
		user: smtpUsername, // generated ethereal user
		pass: smtpPassword, // generated ethereal password
	},
});

export const sendMail = async (from, to, subject, text) => {
	// send mail with defined transport object
	try {
		let info = await transporter.sendMail({
			from, // sender address
			to, // list of receivers
			subject, // Subject line
			text, // plain text body
			// html: "<b>Hello world?</b>", // html body
		});
		console.log("Message sent: %s", info.response);	
	} catch (e) {
		console.log(e.message);
	}
}

