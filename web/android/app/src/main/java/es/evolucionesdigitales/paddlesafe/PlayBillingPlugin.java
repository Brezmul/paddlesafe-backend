package es.evolucionesdigitales.paddlesafe;

import android.app.Activity;
import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Collections;
import java.util.List;

/**
 * Google Play Billing directo. No hay intermediario ni comisión añadida.
 * El precio sale de ProductDetails; esta clase no lo escribe.
 */
@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin {
    private BillingClient cliente;
    private PluginCall compraEnCurso;
    private String productoPedido = "premium";

    @PluginMethod
    public void preparar(PluginCall call) {
        productoPedido = call.getString("producto", "premium");
        asegurarCliente();
        conectar(call, false, null);
    }

    @PluginMethod
    public void restaurar(PluginCall call) {
        productoPedido = call.getString("producto", "premium");
        asegurarCliente();
        conectar(call, false, null);
    }

    @PluginMethod
    public void comprar(PluginCall call) {
        productoPedido = call.getString("producto", "premium");
        String oferta = call.getString("oferta", "");
        if (oferta == null || oferta.isEmpty()) {
            call.resolve(estado(false, "Falta la oferta que devuelve Play."));
            return;
        }
        asegurarCliente();
        compraEnCurso = call;
        conectar(call, true, oferta);
    }

    private void asegurarCliente() {
        if (cliente != null) return;
        cliente = BillingClient.newBuilder(getContext())
            .setListener(this::alActualizarCompras)
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
            )
            .build();
    }

    private void conectar(PluginCall call, boolean lanzar, String oferta) {
        if (cliente.isReady()) {
            if (lanzar) consultarYComprar(call, oferta);
            else consultar(call);
            return;
        }
        cliente.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    if (lanzar) consultarYComprar(call, oferta);
                    else consultar(call);
                } else {
                    call.resolve(estado(false, "Play Billing no está disponible (" + result.getResponseCode() + ")."));
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                call.resolve(estado(false, "Se ha cortado la conexión con Google Play."));
            }
        });
    }

    private void consultar(PluginCall call) {
        QueryProductDetailsParams.Product producto = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(productoPedido)
            .setProductType(BillingClient.ProductType.SUBS)
            .build();
        QueryProductDetailsParams consulta = QueryProductDetailsParams.newBuilder()
            .setProductList(Collections.singletonList(producto))
            .build();
        cliente.queryProductDetailsAsync(consulta, (result, detalles) -> {
            JSArray planes = new JSArray();
            List<ProductDetails> lista = detalles == null ? Collections.emptyList() : detalles.getProductDetailsList();
            if (lista != null) {
                for (ProductDetails item : lista) {
                    List<ProductDetails.SubscriptionOfferDetails> ofertas = item.getSubscriptionOfferDetails();
                    if (ofertas == null) continue;
                    for (ProductDetails.SubscriptionOfferDetails oferta : ofertas) {
                        List<ProductDetails.PricingPhase> fases = oferta.getPricingPhases().getPricingPhaseList();
                        if (fases == null || fases.isEmpty()) continue;
                        ProductDetails.PricingPhase fase = fases.get(fases.size() - 1);
                        JSObject plan = new JSObject();
                        plan.put("idBase", oferta.getBasePlanId());
                        plan.put("oferta", oferta.getOfferToken());
                        plan.put("precio", fase.getFormattedPrice());
                        plan.put("periodo", fase.getBillingPeriod());
                        plan.put("micros", fase.getPriceAmountMicros());
                        plan.put("moneda", fase.getPriceCurrencyCode());
                        planes.put(plan);
                    }
                }
            }
            leerCompras(call, planes, result.getResponseCode() == BillingClient.BillingResponseCode.OK ? null : "No se han podido leer los planes.");
        });
    }

    private void consultarYComprar(PluginCall call, String ofertaBuscada) {
        QueryProductDetailsParams.Product producto = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(productoPedido)
            .setProductType(BillingClient.ProductType.SUBS)
            .build();
        cliente.queryProductDetailsAsync(
            QueryProductDetailsParams.newBuilder().setProductList(Collections.singletonList(producto)).build(),
            (result, detalles) -> {
                ProductDetails elegido = null;
                String token = null;
                List<ProductDetails> lista = detalles == null ? Collections.emptyList() : detalles.getProductDetailsList();
                if (lista != null) {
                    for (ProductDetails item : lista) {
                        List<ProductDetails.SubscriptionOfferDetails> ofertas = item.getSubscriptionOfferDetails();
                        if (ofertas == null) continue;
                        for (ProductDetails.SubscriptionOfferDetails oferta : ofertas) {
                            if (ofertaBuscada.equals(oferta.getOfferToken())) {
                                elegido = item;
                                token = oferta.getOfferToken();
                            }
                        }
                    }
                }
                Activity actividad = getActivity();
                if (elegido == null || token == null || actividad == null) {
                    call.resolve(estado(false, "Esa oferta no está en Google Play."));
                    return;
                }
                BillingFlowParams.ProductDetailsParams params = BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(elegido)
                    .setOfferToken(token)
                    .build();
                BillingFlowParams flujo = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(params))
                    .build();
                BillingResult lanzado = cliente.launchBillingFlow(actividad, flujo);
                if (lanzado.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.resolve(estado(false, "No se ha abierto la hoja de pago."));
                }
            }
        );
    }

    private void alActualizarCompras(BillingResult result, List<Purchase> compras) {
        PluginCall call = compraEnCurso;
        compraEnCurso = null;
        if (call == null) return;
        if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            call.resolve(estado(false, null));
            return;
        }
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            call.resolve(estado(false, "Google Play ha rechazado el pago."));
            return;
        }
        reconocer(compras);
        call.resolve(desdeCompras(compras, new JSArray(), null));
    }

    private void leerCompras(PluginCall call, JSArray planes, String errorPlanes) {
        cliente.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
            (result, compras) -> {
                reconocer(compras);
                JSObject salida = desdeCompras(compras, planes, errorPlanes);
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK && salida.getString("error") == null) {
                    salida.put("error", "No se han podido leer las compras.");
                }
                call.resolve(salida);
            }
        );
    }

    private void reconocer(List<Purchase> compras) {
        if (compras == null || cliente == null) return;
        for (Purchase compra : compras) {
            if (compra.getPurchaseState() == Purchase.PurchaseState.PURCHASED && !compra.isAcknowledged()) {
                AcknowledgePurchaseParams params = AcknowledgePurchaseParams.newBuilder()
                    .setPurchaseToken(compra.getPurchaseToken())
                    .build();
                cliente.acknowledgePurchase(params, billingResult -> { });
            }
        }
    }

    private JSObject desdeCompras(List<Purchase> compras, JSArray planes, String error) {
        boolean activo = false;
        boolean pendiente = false;
        String token = null;
        if (compras != null) {
            for (Purchase compra : compras) {
                if (!compra.getProducts().contains(productoPedido)) continue;
                if (compra.getPurchaseState() == Purchase.PurchaseState.PENDING) pendiente = true;
                if (compra.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                    activo = true;
                    token = compra.getPurchaseToken();
                }
            }
        }
        JSObject salida = estado(true, error);
        salida.put("conectado", cliente != null && cliente.isReady());
        salida.put("activo", activo);
        salida.put("pendiente", pendiente && !activo);
        salida.put("token", token);
        salida.put("producto", productoPedido);
        salida.put("planes", planes);
        return salida;
    }

    private JSObject estado(boolean disponible, String error) {
        JSObject salida = new JSObject();
        salida.put("disponible", disponible);
        salida.put("conectado", false);
        salida.put("activo", false);
        salida.put("pendiente", false);
        salida.put("token", null);
        salida.put("producto", productoPedido);
        salida.put("planes", new JSArray());
        salida.put("error", error);
        return salida;
    }
}
