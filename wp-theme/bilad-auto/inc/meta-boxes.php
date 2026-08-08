<?php
/**
 * حقول مخصصة للمشاريع والخدمات
 *
 * @package BiladAuto
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * إضافة صناديق الحقول
 */
function bilad_add_meta_boxes() {
	add_meta_box(
		'bilad_project_details',
		__( 'تفاصيل المشروع', 'bilad-auto' ),
		'bilad_project_meta_box',
		'project',
		'normal',
		'high'
	);

	add_meta_box(
		'bilad_service_details',
		__( 'تفاصيل الخدمة', 'bilad-auto' ),
		'bilad_service_meta_box',
		'service',
		'normal',
		'high'
	);
}
add_action( 'add_meta_boxes', 'bilad_add_meta_boxes' );

/**
 * صندوق حقول المشروع
 */
function bilad_project_meta_box( $post ) {
	wp_nonce_field( 'bilad_save_meta', 'bilad_meta_nonce' );

	$fields = array(
		'_bilad_capacity' => array(
			'label' => __( 'القدرة (مثال: 500 kW)', 'bilad-auto' ),
			'type'  => 'text',
		),
		'_bilad_panels'   => array(
			'label' => __( 'عدد الألواح', 'bilad-auto' ),
			'type'  => 'text',
		),
		'_bilad_savings'  => array(
			'label' => __( 'الوفر الشهري (مثال: $18k)', 'bilad-auto' ),
			'type'  => 'text',
		),
		'_bilad_location' => array(
			'label' => __( 'الموقع (مثال: بغداد — الكرادة)', 'bilad-auto' ),
			'type'  => 'text',
		),
		'_bilad_year'     => array(
			'label' => __( 'السنة', 'bilad-auto' ),
			'type'  => 'text',
		),
	);

	echo '<table class="form-table">';
	foreach ( $fields as $key => $field ) {
		$value = get_post_meta( $post->ID, $key, true );
		printf(
			'<tr><th><label for="%1$s">%2$s</label></th><td><input type="text" id="%1$s" name="%1$s" value="%3$s" class="regular-text"></td></tr>',
			esc_attr( $key ),
			esc_html( $field['label'] ),
			esc_attr( $value )
		);
	}

	// خانة "مشروع مميز"
	$featured = get_post_meta( $post->ID, '_bilad_featured', true );
	printf(
		'<tr><th><label for="_bilad_featured">%s</label></th><td><input type="checkbox" id="_bilad_featured" name="_bilad_featured" value="1" %s> <span class="description">%s</span></td></tr>',
		esc_html__( 'مشروع مميز', 'bilad-auto' ),
		checked( $featured, '1', false ),
		esc_html__( 'يظهر في الصفحة الرئيسية', 'bilad-auto' )
	);

	echo '</table>';
}

/**
 * صندوق حقول الخدمة
 */
function bilad_service_meta_box( $post ) {
	wp_nonce_field( 'bilad_save_meta', 'bilad_meta_nonce' );

	$range    = get_post_meta( $post->ID, '_bilad_range', true );
	$features = get_post_meta( $post->ID, '_bilad_features', true );
	?>
	<table class="form-table">
		<tr>
			<th><label for="_bilad_range"><?php esc_html_e( 'نطاق القدرة', 'bilad-auto' ); ?></label></th>
			<td>
				<input type="text" id="_bilad_range" name="_bilad_range" value="<?php echo esc_attr( $range ); ?>" class="regular-text"
				       placeholder="<?php esc_attr_e( 'مثال: 3 kW — 30 kW', 'bilad-auto' ); ?>">
			</td>
		</tr>
		<tr>
			<th><label for="_bilad_features"><?php esc_html_e( 'المميزات', 'bilad-auto' ); ?></label></th>
			<td>
				<textarea id="_bilad_features" name="_bilad_features" rows="8" class="large-text"
				          placeholder="<?php esc_attr_e( 'ميزة في كل سطر', 'bilad-auto' ); ?>"><?php echo esc_textarea( $features ); ?></textarea>
				<p class="description"><?php esc_html_e( 'اكتب كل ميزة في سطر منفصل', 'bilad-auto' ); ?></p>
			</td>
		</tr>
	</table>
	<?php
}

/**
 * حفظ الحقول
 */
function bilad_save_meta( $post_id ) {
	if ( ! isset( $_POST['bilad_meta_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['bilad_meta_nonce'] ) ), 'bilad_save_meta' ) ) {
		return;
	}

	if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
		return;
	}

	if ( ! current_user_can( 'edit_post', $post_id ) ) {
		return;
	}

	$text_fields = array(
		'_bilad_capacity',
		'_bilad_panels',
		'_bilad_savings',
		'_bilad_location',
		'_bilad_year',
		'_bilad_range',
	);

	foreach ( $text_fields as $field ) {
		if ( isset( $_POST[ $field ] ) ) {
			update_post_meta( $post_id, $field, sanitize_text_field( wp_unslash( $_POST[ $field ] ) ) );
		}
	}

	if ( isset( $_POST['_bilad_features'] ) ) {
		update_post_meta( $post_id, '_bilad_features', sanitize_textarea_field( wp_unslash( $_POST['_bilad_features'] ) ) );
	}

	// خانة الاختيار
	if ( isset( $_POST['_bilad_featured'] ) ) {
		update_post_meta( $post_id, '_bilad_featured', '1' );
	} else {
		delete_post_meta( $post_id, '_bilad_featured' );
	}
}
add_action( 'save_post', 'bilad_save_meta' );
