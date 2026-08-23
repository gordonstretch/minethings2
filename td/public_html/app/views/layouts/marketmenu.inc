			<div style="position:relative; z-index:10;">
				<div id="marketmenu" style="display:none; position:absolute; top:0px; left:-200px;">
				<table width=200 border=1 bgcolor="#804E0F">
				<?
					foreach($mineCategories as $categoryName => $mines) {
						$cells = array('<font style="color:white;">'.$categoryName.'</font>');
						foreach($mines as $mineTypeName => $mineTypeId) {
							$cells[] = $html->link($mineTypeName, '/mine_types/browse/'.$mineTypeId, array('class' => 'menuitem'));
						}
						echo $html->tableCells(array($cells));
					}
				?>
				</table>
				</div>
			</div>
