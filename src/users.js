
import { firebaseAuth, firestore, cloudfunctionsBaseUrl } from '@/firebase';

import axios from 'axios';
import frappe from 'frappejs';
import config from '@/config';

let currentUser

export default  {

	async getCurrentUser() {
		if (currentUser) {
			return currentUser;
		}

		let user = currentUser = await firebaseAuth.currentUser;

		if (user) {
			user.token = await user.getIdToken(true);
			try {
				user.local = await frappe.getDoc('SpinBiUser', user.email);
			} catch (ex) { }

			//frappe.session.user = user;
			return currentUser;
		}

		return new Promise((resolve, reject) => {
			const unsubscribe = firebaseAuth.onAuthStateChanged(async user => {
				unsubscribe();
				user.token = await user.getIdToken(true);
				try {
					user.local = await frappe.getDoc('SpinBiUser', user.email);
				} catch(ex) {}
				//frappe.session.user = user;
				currentUser == user;
				resolve(user);
			}, reject);
		});
	},

	async login(email, password) {
		await firebaseAuth.signInWithEmailAndPassword(
			email,
			password
		);

		const connectionParams = config.get('lastSelectedDB');
		if (!connectionParams) {
			const fbuser = await this.getCurrentUser();
			const connectionParams =  await axios.get(`${cloudfunctionsBaseUrl}/login`, {
				headers: {
					Authorization: 'Bearer ' + fbuser.token
				}
			})

			config.set('lastSelectedDB', JSON.stringify(connectionParams));
		}
	},

	async signup(user) {
		const { email, password } = user;
		try {
			await firebaseAuth.createUserWithEmailAndPassword(email, password);
		} catch (ex) {
			console.error(ex);
			await firebaseAuth.signInWithEmailAndPassword(email, password);
		}

		const fbuser = await this.getCurrentUser();
		const connectionParams =  await axios.post(`${cloudfunctionsBaseUrl}/signup`, {
			email: user.email,
			companyName: user.companyName
		}, {
			headers: {
				Authorization: 'Bearer ' + fbuser.token
			}
		})

		config.set('lastSelectedDB', JSON.stringify(connectionParams));
		return fbuser;
	},

	async createUser(user) {
		const fbuser = await this.getCurrentUser();
		const uid = await axios.post(`${cloudfunctionsBaseUrl}/createUser`, {
			email: user.email,
			password: user.password
		}, {
			headers: {
				Authorization: 'Bearer ' + fbuser.token
			}
		})

		user.set('userId', uid);
		await user.update();
	},

	async updateUser(user) {
		const fbuser = await this.getCurrentUser();
		await axios.post(`${cloudfunctionsBaseUrl}/updateUser/${user.userId}`, {email: user.email, password: user.password}, {
			headers: {
				Authorization: 'Bearer ' + fbuser.token
			}
		})
	},

	async deleteUser(user) {
		const fbuser = await this.getCurrentUser();
		await axios.delete(`${cloudfunctionsBaseUrl}/deleteUser/${user.userId}`, {
			headers: {
				Authorization: 'Bearer ' + fbuser.token
			}
		})
	}
}