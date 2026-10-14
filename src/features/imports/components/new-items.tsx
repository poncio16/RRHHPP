import Link from "next/link";
import { Fragment } from "react";
import { Alert } from "@/components/ui/alert";
import { CATALOGS } from "@/features/catalogs/definitions";
import { CREATABLE_LOOKUPS } from "../columns";
import type { NewCatalogItem } from "../map";

/**
 * Sectores, puestos y establecimientos que la importación da de alta al
 * confirmar (o que ya dio de alta), agrupados por catálogo. Con `links`, cada
 * uno lleva a su catálogo para completar los datos.
 */
export function NewItems({ items, created, links }: { items: NewCatalogItem[]; created: boolean; links: boolean }) {
  const groups = CREATABLE_LOOKUPS.map((key) => ({
    key,
    title: CATALOGS[key].title,
    items: items.filter((item) => item.key === key),
  })).filter((group) => group.items.length > 0);
  const similar = !created && items.some((item) => item.similar);

  return (
    <Alert variant={similar ? "warning" : "info"}>
      <p>
        {created
          ? "Se dieron de alta en Catálogos:"
          : "Al confirmar se dan de alta en Catálogos, con el nombre tal como está escrito:"}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {groups.map((group) => (
          <li key={group.key}>
            <span className="font-medium">{group.title}:</span>{" "}
            {group.items.map((item, i) => (
              <Fragment key={item.id}>
                {i > 0 && ", "}
                {links ? (
                  <Link
                    href={`/configuracion/catalogos/${group.key}?q=${encodeURIComponent(item.name)}`}
                    className="text-primary hover:underline"
                  >
                    {item.name}
                  </Link>
                ) : (
                  item.name
                )}
                {!created && item.similar && (
                  <span className="text-muted-foreground"> (¿no es &ldquo;{item.similar}&rdquo;?)</span>
                )}
              </Fragment>
            ))}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-2">
        {created
          ? "Completá sus datos en Configuración → Catálogos: la descripción y los elementos de protección de cada puesto y el domicilio de cada establecimiento salen en el formulario de entrega de EPP."
          : "Si alguno es un error de tipeo de un valor que ya existe, descartá, corregí el archivo y volvé a subirlo. Los demás datos de cada uno se completan después en Configuración → Catálogos."}
      </p>
    </Alert>
  );
}
