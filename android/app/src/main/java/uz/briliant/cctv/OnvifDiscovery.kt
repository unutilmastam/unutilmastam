package uz.briliant.cctv

import android.content.Context
import android.net.wifi.WifiManager
import org.json.JSONArray
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.util.UUID

/**
 * ONVIF WS-Discovery (Probe) — lokal tarmoqdagi kameralarni topadi.
 * 239.255.255.250:3702 multicast manziliga SOAP Probe yuboriladi va
 * ProbeMatch javoblaridan XAddrs, Scopes maydonlari ajratib olinadi.
 */
class OnvifDiscovery(private val context: Context) {

    private val group = "239.255.255.250"
    private val port = 3702

    private fun probeMessage(): String {
        val id = UUID.randomUUID().toString()
        return """<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
            xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
            xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>uuid:$id</w:MessageID>
    <w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body>
    <d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe>
  </e:Body>
</e:Envelope>"""
    }

    fun probe(timeoutMs: Int): JSONArray {
        val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        val lock = wifi?.createMulticastLock("briliant-onvif")?.apply { setReferenceCounted(true); acquire() }
        val found = LinkedHashMap<String, JSONObject>()
        var socket: DatagramSocket? = null
        try {
            socket = DatagramSocket().apply {
                broadcast = true
                soTimeout = 900
            }
            val payload = probeMessage().toByteArray()
            val addr = InetAddress.getByName(group)
            // Bir nechta Probe — UDP paketlar yoʻqolishi mumkin
            repeat(3) {
                socket.send(DatagramPacket(payload, payload.size, addr, port))
                Thread.sleep(120)
            }
            val buf = ByteArray(16 * 1024)
            val deadline = System.currentTimeMillis() + timeoutMs
            while (System.currentTimeMillis() < deadline) {
                val pkt = DatagramPacket(buf, buf.size)
                try {
                    socket.receive(pkt)
                } catch (e: java.net.SocketTimeoutException) {
                    continue
                }
                val body = String(pkt.data, 0, pkt.length)
                parse(body, pkt.address.hostAddress ?: "")?.let { dev ->
                    val key = dev.optString("host")
                    if (key.isNotEmpty() && !found.containsKey(key)) found[key] = dev
                }
            }
        } catch (e: Exception) {
            // tarmoq yopiq boʻlsa — boʻsh roʻyxat qaytadi
        } finally {
            try { socket?.close() } catch (e: Exception) {}
            try { lock?.release() } catch (e: Exception) {}
        }
        return JSONArray(found.values.toList())
    }

    private fun parse(xml: String, sender: String): JSONObject? {
        if (!xml.contains("ProbeMatch", true)) return null
        val xaddrs = tag(xml, "XAddrs").trim().split(Regex("\\s+")).firstOrNull { it.startsWith("http") } ?: ""
        val scopes = tag(xml, "Scopes")
        val host = Regex("https?://([^/:]+)").find(xaddrs)?.groupValues?.get(1) ?: sender
        if (host.isBlank()) return null
        return JSONObject().apply {
            put("host", host)
            put("xaddr", xaddrs)
            put("scopes", scopes)
            put("name", scopeValue(scopes, "name") ?: scopeValue(scopes, "hardware") ?: "ONVIF qurilma")
            put("model", scopeValue(scopes, "hardware") ?: "")
        }
    }

    /** Nom maydonini prefiksdan qatʼi nazar oladi: <d:XAddrs>, <wsd:XAddrs>, <XAddrs> */
    private fun tag(xml: String, name: String): String =
        Regex("<(?:[A-Za-z0-9_]+:)?$name[^>]*>([^<]*)</(?:[A-Za-z0-9_]+:)?$name>", RegexOption.IGNORE_CASE)
            .find(xml)?.groupValues?.get(1) ?: ""

    /** onvif://www.onvif.org/name/HIKVISION%20DS-2CD... → "HIKVISION DS-2CD..." */
    private fun scopeValue(scopes: String, key: String): String? =
        Regex("onvif://www\\.onvif\\.org/$key/([^\\s]+)", RegexOption.IGNORE_CASE)
            .find(scopes)?.groupValues?.get(1)
            ?.let { java.net.URLDecoder.decode(it, "UTF-8") }
}
