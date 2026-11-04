import { connect } from '../_lib/oauth.js';
export const onRequestGet = context => connect(context, 'google');
