import { applyPatch } from 'fast-json-patch/index.mjs';
import { Socket, Channel, Presence } from "phoenix";

// This file is copied from https://github.com/launchscout/phx-live-state
// the original is MIT Licensed: 
// https://github.com/launchscout/phx-live-state/blob/992349f8ef6f1339a1f84a732121816e6c552d02/package.json#L22

// This file has been adjusted because the original imported `applyPatch` from a dependency
// that did not work.

// export type LiveStateConfig = {

//   /** The end point to connect to, should be a websocket url (ws or wss) */
//   url?: string,

//   /** The topic for the channel */
//   topic?: string,

//   /** will be sent as params on channel join */
//   params?: object

//   /** the options passed to the phoenix socket */
//   socketOptions?: object
// }

// export type LiveStateError = {
//   /**
//    * Describes what type of error occurred. 
//    */
//   type: string;

//   /** The original error payload, type depends on error */
//   message: string;
// }

// export type LiveStateChange = {

//   /** state version as known by the channel */
//   version: number;
  
//   state: object;
// }

// export type LiveStatePatch = {

//   /** the version this patch is valid for  */
//   version: number;

//   /** the json patch to be applied */
//   patch: any;
// }


/**
 * This is the lower level API for LiveState. It connects to a 
 * [live_state]() channel over websockets and is responsible 
 * for maintaining the state. From the channel it receives `state:change` events which 
 * replace the state entirely, or `state:patch` events which contain a json 
 * patch to be applied.
 * 
 * ## Events
 * 
 * ### Dispatching
 * A `CustomEvent` dispatched to LiveState will be pushed over the channel as 
 * event with the `lvs_evt:` prefix and the detail property will become the payload
 * 
 * ### Listeners
 * 
 * Events which begin with `livestate-` are assumed to be livestate internal events.
 * The following CustomEvents are supported:
 * 
 * | Event             | Detail type             | Description                          |
 * | ----------------- | ----------------------- | ------------------------------------ |
 * | livestate-error   | {@link LiveStateError}  | Occurs on channel or socket errors   |
 * | livestate-change  | {@link LiveStateChange} | on `state:change` from channel       |
 * | livestate-patch   | {@link LiveStatePatch}  | on `state:patch` from channel        |
 * | livestate-connect | none                    | on successful socket or channel join |
 * 
 * Will occur on channel or socket errors. The `detail` will consist of 
 * 
 * Any other event name not prefixed with `livestate-` will be assumed to be a channel
 * event and will result in a event being listened to on the channel, which when
 * received, will be dispatched as a CustomEvent of the same name with the payload 
 * from the channel event becoming the `detail` property.
 */
export class LiveState {
  config;
  channel;
  socket;
  state;
  stateVersion;
  joined = false;
  eventTarget;

  constructor(socket, config) {
    this.config = config;
    this.socket = socket
    
    this.eventTarget = new EventTarget();
  }

  /** connect to socket and join channel. will do nothing if already connected */
  join() {
    if (!this.joined) {
      this.channel = this.socket.channel(this.config.topic, this.config.params);
      this.presence = new Presence(this.channel)

       this.presence.onSync(() => {

              const newList = this.presence.list(
                      (id, { metas }) => {
                        const [{ color, username, cursor }, ...rest] = metas;

                        return {
                                id,
                                data: { color, username, cursors: metas.map((m) => ({
                                                                  value: m.cursor,
                                                                  self: m.connection_id === this.connection_id
                                                                })), selections: metas.map((m) => ({
                                                                  value: m.selection,
                                                                  self: m.connection_id === this.connection_id
                                                                })) },
                                count: metas.length,
                        }
                      },
              );


              this.eventTarget.dispatchEvent(new CustomEvent('presence-changed', {
                detail: newList
              }))
      });

      this.channel.onError((e) => this.emitError('channel error', e));
      this.channel.join().receive("ok", ({connection_id}) => {
        this.connection_id = connection_id
      }).receive('error', (e) => {
        this.emitError('channel join error', e)
      });
      this.channel.on("state:change", (state) => this.handleChange(state));
      this.channel.on("state:patch", (patch) => this.handlePatch(patch));
      this.channel.on("error", (error) => this.emitServerError(error));
      this.joined = true;
      //console.log("joined")
    } else {
      //console.error("not joined")
    }
  }

  /** leave channel and disconnect from socket */
  leave() {
    this.channel && this.channel.leave();
    this.joined = false;
    this.channel = null
  }

  /** for events that begin with 'livestate-', add a listener. For
   * other events, additionally call `channel.on` to receive the event 
   * over the channel, which will then be dispatched.
   */
  addEventListener(type, listener, options) {
    this.eventTarget.addEventListener(type, listener, options);
    if (!type.startsWith('livestate-')) {
      this.channel?.on(type, (payload) => {
        this.eventTarget.dispatchEvent(new CustomEvent(type, {detail: payload}));
      });      
    }
  }

  removeEventListener(type, listener, options) {
    return this.eventTarget.removeEventListener(type, listener, options);
  }

  /** @deprecated */
  subscribe(subscriber) {
    this.addEventListener('livestate-change', subscriber);
  }

  /** @deprecated */
  unsubscribe(subscriber) {
    this.removeEventListener('livestate-change', subscriber);
  }

  emitServerError(error) {
    this.eventTarget.dispatchEvent(new CustomEvent('livestate-error', {detail: error}));
  }

  emitError(type, error) {
    this.eventTarget.dispatchEvent(new CustomEvent('livestate-error', {
      detail: {
        type, message: this.extractMessage(error)
      }
    }))
  }

  extractMessage(error) {
    if (error && typeof(error == 'object')) {
      const message =  [error.reason, error.name, error.message].find(value => value);
      return message;
    } else if (typeof(error) == 'string') {
      return error;
    }
  }

  handleChange({ state, version }) {
    this.state = state;
    this.stateVersion = version;
    this.eventTarget.dispatchEvent(new CustomEvent('livestate-change', {
      detail: {
        state: this.state,
        version: this.stateVersion
      }
    }));
  }

  handlePatch({ patch, version }) {
    this.eventTarget.dispatchEvent(new CustomEvent('livestate-patch', {
      detail: {patch, version}
    }));
    if (this.versionMatches(version)) {
      const newDocument = applyPatch(this.state, patch, false, false).newDocument
      this.state = newDocument;
      this.stateVersion = version;
      this.eventTarget.dispatchEvent(new CustomEvent('livestate-change', {
        detail: {
          state: this.state,
          version: this.stateVersion,
          patch: (oldState) => applyPatch(oldState, patch, false, false).newDocument
        }
      }));
    } else {
      this.channel.push('lvs_refresh');
    }
  }

  versionMatches(version) {
    return (version === this.stateVersion + 1) || (version === 0);
  }

  pushEvent(eventName, payload) {
    this.dispatchEvent(new CustomEvent(eventName, {detail: payload}));
  }

  /** Pushes the event over the channel, adding the `lvs_evt:` prefix and using the CustomEvent
   * detail property as the payload
   */
  dispatchEvent(event) {
    this.channel.push(`lvs_evt:${event.type}`, event.detail);
    return true;
  }

  sendAction(name, payload) {
    return new Promise((resolve, reject) => {
      this.channel.push(`lvs_evt:${name}`, payload).receive('ok', (payload) => {
        resolve(payload)
      }).receive('error', (payload) => {
        reject(payload)
      })
    })
  }

  castAction(name, payload) {
    this.channel.push(`lvs_evt:${name}`, payload, 500)
  }

  pushCustomEvent(event) { this.dispatchEvent(event); }
}

export default LiveState;

